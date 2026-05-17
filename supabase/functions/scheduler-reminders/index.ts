// Cron-invoked every 5 minutes by pg_cron. Finds confirmed bookings whose
// start time falls inside the 24h or 1h reminder window and sends a reminder
// to the invitee. Uses crm_scheduler_reminder_log for idempotency
// (UNIQUE(booking_id, reminder_kind, channel)).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Window { kind: "24h" | "1h"; minMs: number; maxMs: number; label: string; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = Date.now();
    // Cron runs every 5 min; widen the window slightly so we don't miss any
    // booking whose start_at falls between cron ticks.
    const windows: Window[] = [
      { kind: "24h", minMs: now + 23 * 3600 * 1000 + 55 * 60 * 1000, maxMs: now + 24 * 3600 * 1000 + 5 * 60 * 1000, label: "Tomorrow at this time" },
      { kind: "1h",  minMs: now + 55 * 60 * 1000, maxMs: now + 65 * 60 * 1000, label: "Starting in about an hour" },
    ];

    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const w of windows) {
      const { data: bookings, error } = await supabase
        .from("crm_scheduler_bookings")
        .select("id, contact_id, invitee_email, invitee_phone, start_at, status")
        .is('deleted_at', null)
        .in("status", ["confirmed", "rescheduled"])
        .gte("start_at", new Date(w.minMs).toISOString())
        .lte("start_at", new Date(w.maxMs).toISOString());
      if (error) throw error;

      for (const b of (bookings || [])) {
        // ----- EMAIL channel -----
        if (b.invitee_email) {
          // Atomically claim this reminder using the unique index.
          const { error: claimErr } = await supabase
            .from("crm_scheduler_reminder_log")
            .insert({
              booking_id: b.id,
              reminder_kind: w.kind,
              channel: "email",
              recipient: b.invitee_email,
              status: "pending",
            });
          if (claimErr) {
            if ((claimErr as any).code !== "23505") {
              console.warn("reminder claim failed", b.id, w.kind, claimErr);
            }
            totalSkipped++;
          } else {
            try {
              const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-send-emails`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SERVICE_KEY}`,
                },
                body: JSON.stringify({
                  kind: "reminder",
                  booking_id: b.id,
                  reminder_label: w.label,
                }),
              });
              if (!sendRes.ok) throw new Error(`status ${sendRes.status}`);
              await supabase
                .from("crm_scheduler_reminder_log")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("booking_id", b.id).eq("reminder_kind", w.kind).eq("channel", "email");
              totalSent++;
            } catch (e) {
              await supabase
                .from("crm_scheduler_reminder_log")
                .update({ status: "failed", error: String((e as Error).message) })
                .eq("booking_id", b.id).eq("reminder_kind", w.kind).eq("channel", "email");
              totalFailed++;
            }
          }
        }

        // ----- SMS channel -----
        // Skip silently when:
        //  - the invitee never gave us a phone, OR
        //  - the invitee phone is in crm_sms_opt_outs (and not re-opted in).
        // No reminder_log row is created for opt-outs so we never re-attempt
        // and never surface the skip in the cron's totals as a "real" skip.
        if (b.invitee_phone) {
          const { data: optOut } = await supabase
            .from("crm_sms_opt_outs")
            .select("id")
            .eq("phone", b.invitee_phone)
            .is("re_opted_in_at", null)
            .maybeSingle();
          if (optOut) {
            // silent — do not log, do not count
            continue;
          }

          const { error: smsClaimErr } = await supabase
            .from("crm_scheduler_reminder_log")
            .insert({
              booking_id: b.id,
              reminder_kind: w.kind,
              channel: "sms",
              recipient: b.invitee_phone,
              status: "pending",
            });
          if (smsClaimErr) {
            if ((smsClaimErr as any).code !== "23505") {
              console.warn("sms reminder claim failed", b.id, w.kind, smsClaimErr);
            }
            totalSkipped++;
            continue;
          }

          try {
            const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({
                to: b.invitee_phone,
                body: `${w.label} — your appointment. Reply STOP to opt out.`,
                channel: "sms",
                source: `scheduler-reminder:${w.kind}`,
                booking_id: b.id,
              }),
            });
            const smsJson = await smsRes.json().catch(() => ({}));
            // send-sms may also return OPTED_OUT if the row was created in a race.
            // Treat that as a silent skip too — clear the pending claim row.
            if (!smsRes.ok && smsJson?.code === "OPTED_OUT") {
              await supabase
                .from("crm_scheduler_reminder_log")
                .delete()
                .eq("booking_id", b.id).eq("reminder_kind", w.kind).eq("channel", "sms");
              continue;
            }
            if (!smsRes.ok) throw new Error(smsJson?.error || `status ${smsRes.status}`);
            await supabase
              .from("crm_scheduler_reminder_log")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("booking_id", b.id).eq("reminder_kind", w.kind).eq("channel", "sms");
            totalSent++;
            // Fire-and-forget engagement log. Staged=true because SMS still
            // routes through the legacy outbound queue, not Twilio direct.
            try {
              if (b.contact_id) {
                await supabase.from('crm_engagement_events').insert({
                  contact_id: b.contact_id,
                  actor_id: null,
                  event_type: 'sms_sent',
                  source: 'scheduler',
                  direction: 'outbound',
                  metadata: {
                    booking_id: b.id,
                    reminder_kind: w.kind,
                    recipient: b.invitee_phone,
                    scheduled_for: b.start_at,
                    staged: true,
                  },
                });
              }
            } catch (logErr) {
              console.warn('engagement log (sms) failed', logErr);
            }
          } catch (e) {
            await supabase
              .from("crm_scheduler_reminder_log")
              .update({ status: "failed", error: String((e as Error).message) })
              .eq("booking_id", b.id).eq("reminder_kind", w.kind).eq("channel", "sms");
            totalFailed++;
          }
        }

        if (!b.invitee_email && !b.invitee_phone) totalSkipped++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent, skipped: totalSkipped, failed: totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("scheduler-reminders error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
