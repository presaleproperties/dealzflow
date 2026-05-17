// Internal endpoint invoked by other scheduler edge functions to send all
// transactional booking mail (confirmations, agent notifications,
// cancellations, reminders) through the existing CRM email bridge.
//
// Auth: requires service-role key in the Authorization header — only callable
// from other edge functions, not from the public web.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildInviteeConfirmation,
  buildAgentNotification,
  buildCancellationEmail,
  buildReminderEmail,
  sendSchedulerEmail,
} from "../_shared/scheduler-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resolve at call time so the URL is correct on dealzflow.ca, the preview, or any
// custom domain. Order: explicit env override → request origin (when invoked over HTTP)
// → dealzflow.ca fallback. Note: when invoked server-to-server (no Origin header) we
// land on the env override or the production fallback, which is what we want.
function resolvePublicBase(req: Request): string {
  const env = Deno.env.get("PUBLIC_BASE_URL")?.replace(/\/+$/, "");
  if (env) return env;
  const origin = req.headers.get("origin")?.replace(/\/+$/, "");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  return "https://dealzflow.ca";
}

type Kind = "invitee_confirmation" | "agent_notification" | "invitee_cancellation" | "agent_cancellation" | "reminder";

interface Payload {
  kind: Kind;
  booking_id: string;
  reminder_label?: string; // for reminder
  reason?: string | null;  // for cancellations
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Require service role token (internal-only)
    const auth = req.headers.get("authorization") || "";
    const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    if (auth !== expected) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { kind, booking_id, reminder_label, reason } = (await req.json()) as Payload;
    if (!kind || !booking_id) {
      return new Response(JSON.stringify({ error: "kind and booking_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Hydrate booking + event + agent (no FK between bookings.agent_user_id
    // and crm_team.user_id, so we fetch separately).
    const { data: booking, error: bErr } = await supabase
      .from("crm_scheduler_bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!booking) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: evt }, { data: agent }] = await Promise.all([
      supabase
        .from("crm_scheduler_event_types")
        .select("slug,title,location_type,location_value")
        .eq("id", booking.event_type_id)
        .maybeSingle(),
      supabase
        .from("crm_team")
        .select("slug,display_name,email,timezone")
        .eq("user_id", booking.agent_user_id)
        .maybeSingle(),
    ]);
    const evtRow = evt || {} as any;
    const agentRow = agent || {} as any;
    const inviteeName = `${booking.invitee_first_name} ${booking.invitee_last_name === "(unknown)" ? "" : booking.invitee_last_name}`.trim();
    const agentName = agentRow.display_name || agentRow.email || "Your agent";
    const teamSlug = agentRow.slug;

    const PUBLIC_BASE = resolvePublicBase(req);
    const cancelUrl = teamSlug ? `${PUBLIC_BASE}/r/${teamSlug}/cancel?b=${booking.id}` : null;
    const rescheduleUrl = teamSlug && evtRow.slug ? `${PUBLIC_BASE}/r/${teamSlug}/${evtRow.slug}?reschedule=${booking.id}` : null;

    const ctx = {
      agentName,
      agentEmail: agentRow.email,
      agentPhone: null,
      inviteeName: inviteeName || "there",
      eventTitle: evtRow.title || "Meeting",
      startAt: booking.start_at,
      durationMin: booking.duration_min,
      timezone: booking.invitee_timezone || agentRow.timezone || "America/Vancouver",
      locationType: booking.location_type,
      locationValue: booking.location_value,
      meetingLink: booking.meeting_link,
      notes: booking.notes_for_agent,
      cancelUrl,
      rescheduleUrl,
    };

    const sends: Promise<void>[] = [];

    if (kind === "invitee_confirmation" && booking.invitee_email) {
      const { subject, html } = buildInviteeConfirmation(ctx);
      sends.push(sendSchedulerEmail({ to: booking.invitee_email, subject, html }));
    }
    if (kind === "agent_notification" && agentRow.email) {
      const { subject, html } = buildAgentNotification({
        ...ctx,
        inviteeEmail: booking.invitee_email,
        inviteePhone: booking.invitee_phone,
      });
      sends.push(sendSchedulerEmail({ to: agentRow.email, subject, html }));
    }
    if (kind === "invitee_cancellation" && booking.invitee_email) {
      const { subject, html } = buildCancellationEmail({ ...ctx, audience: "invitee", reason: reason ?? booking.cancellation_reason });
      sends.push(sendSchedulerEmail({ to: booking.invitee_email, subject, html }));
    }
    if (kind === "agent_cancellation" && agentRow.email) {
      const { subject, html } = buildCancellationEmail({ ...ctx, audience: "agent", reason: reason ?? booking.cancellation_reason });
      sends.push(sendSchedulerEmail({ to: agentRow.email, subject, html }));
    }
    if (kind === "reminder" && booking.invitee_email) {
      const { subject, html } = buildReminderEmail({ ...ctx, reminderLabel: reminder_label || "Upcoming meeting" });
      sends.push(sendSchedulerEmail({ to: booking.invitee_email, subject, html }));
    }

    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === "rejected").length;

    // Fire-and-forget engagement log — every successful send adds one
    // crm_engagement_events row scoped to the booking's contact. Wrapped in
    // try/catch so a failed insert never blocks the response.
    try {
      const succeeded = results.length - failed;
      if (succeeded > 0 && booking.contact_id) {
        await supabase.from('crm_engagement_events').insert({
          contact_id: booking.contact_id,
          actor_id: null,
          event_type: 'email_sent',
          source: 'scheduler',
          direction: 'outbound',
          metadata: {
            kind,
            booking_id: booking.id,
            event_slug: evtRow.slug ?? null,
            subject: kind === 'reminder' ? (reminder_label || 'Upcoming meeting') : (evtRow.title ?? 'Meeting'),
            scheduled_for: booking.start_at,
            recipient: kind === 'agent_notification' || kind === 'agent_cancellation'
              ? agentRow.email
              : booking.invitee_email,
          },
        });
      }
    } catch (logErr) {
      console.warn('engagement log insert failed', logErr);
    }

    return new Response(JSON.stringify({ ok: true, attempted: results.length, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scheduler-send-emails error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
