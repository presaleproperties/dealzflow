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

const PUBLIC_BASE = "https://dealzflow.ca";

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

    // Hydrate booking + event + agent
    const { data: booking, error: bErr } = await supabase
      .from("crm_scheduler_bookings")
      .select(`*,
        event_type:crm_scheduler_event_types(slug,title,location_type,location_value),
        agent:crm_team!agent_user_id(slug,display_name,email,phone,timezone)`)
      .eq("id", booking_id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!booking) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evt = (booking as any).event_type || {};
    const agent = (booking as any).agent || {};
    const inviteeName = `${booking.invitee_first_name} ${booking.invitee_last_name === "(unknown)" ? "" : booking.invitee_last_name}`.trim();
    const agentName = agent.display_name || agent.email || "Your agent";
    const teamSlug = agent.slug;

    const cancelUrl = teamSlug ? `${PUBLIC_BASE}/book/${teamSlug}/cancel?b=${booking.id}` : null;
    const rescheduleUrl = teamSlug && evt.slug ? `${PUBLIC_BASE}/book/${teamSlug}/${evt.slug}?reschedule=${booking.id}` : null;

    const ctx = {
      agentName,
      agentEmail: agent.email,
      agentPhone: agent.phone,
      inviteeName: inviteeName || "there",
      eventTitle: evt.title || "Meeting",
      startAt: booking.start_at,
      durationMin: booking.duration_min,
      timezone: booking.invitee_timezone || agent.timezone || "America/Vancouver",
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
    if (kind === "agent_notification" && agent.email) {
      const { subject, html } = buildAgentNotification({
        ...ctx,
        inviteeEmail: booking.invitee_email,
        inviteePhone: booking.invitee_phone,
      });
      sends.push(sendSchedulerEmail({ to: agent.email, subject, html }));
    }
    if (kind === "invitee_cancellation" && booking.invitee_email) {
      const { subject, html } = buildCancellationEmail({ ...ctx, audience: "invitee", reason: reason ?? booking.cancellation_reason });
      sends.push(sendSchedulerEmail({ to: booking.invitee_email, subject, html }));
    }
    if (kind === "agent_cancellation" && agent.email) {
      const { subject, html } = buildCancellationEmail({ ...ctx, audience: "agent", reason: reason ?? booking.cancellation_reason });
      sends.push(sendSchedulerEmail({ to: agent.email, subject, html }));
    }
    if (kind === "reminder" && booking.invitee_email) {
      const { subject, html } = buildReminderEmail({ ...ctx, reminderLabel: reminder_label || "Upcoming meeting" });
      sends.push(sendSchedulerEmail({ to: booking.invitee_email, subject, html }));
    }

    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === "rejected").length;

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
