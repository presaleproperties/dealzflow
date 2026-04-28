// Daily morning digest: for every agent with bookings today (in their tz),
// send a single summary email. Triggered by pg_cron at 7am local-ish (UTC offset).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function fmtTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: tz,
    }).format(new Date(iso));
  } catch { return iso; }
}
function fmtDate(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: tz,
  }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Get all agents with active scheduler
    const { data: agents } = await supabase
      .from('crm_team')
      .select('user_id,email,display_name,timezone,slug')
      .not('slug', 'is', null);

    if (!agents?.length) {
      return new Response(JSON.stringify({ ok: true, agents: 0 }), { headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    let sent = 0;

    for (const agent of agents) {
      const tz = agent.timezone || 'America/Vancouver';
      // Compute today's UTC range from agent local midnight to next midnight
      const now = new Date();
      const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const startLocal = new Date(`${local}T00:00:00`);
      // Get tz offset by formatting
      const offsetParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
        .formatToParts(now).find(p => p.type === 'timeZoneName')?.value || 'GMT';
      const m = offsetParts.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      const sign = m?.[1] === '-' ? 1 : -1;
      const offMin = m ? sign * ((parseInt(m[2]) * 60) + parseInt(m[3] || '0')) : 0;
      const startUtc = new Date(startLocal.getTime() + offMin * 60_000);
      const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60_000);

      const { data: bookings } = await supabase
        .from('crm_scheduler_bookings')
        .select('start_at,end_at,invitee_first_name,invitee_last_name,invitee_email,invitee_phone,location_type,location_value,notes_for_agent,event_type:crm_scheduler_event_types(title)')
        .eq('agent_user_id', agent.user_id)
        .in('status', ['confirmed', 'rescheduled'])
        .gte('start_at', startUtc.toISOString())
        .lt('start_at', endUtc.toISOString())
        .order('start_at', { ascending: true });

      if (!bookings?.length || !agent.email) continue;

      const rows = bookings.map((b: any) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;font-family:Georgia,serif;color:#14181F;font-size:14px;font-weight:600;">
            ${fmtTime(b.start_at, tz)}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;color:#333;">
            <div style="font-weight:600;">${b.invitee_first_name} ${b.invitee_last_name === '(unknown)' ? '' : b.invitee_last_name}</div>
            <div style="color:#666;font-size:12px;">${b.event_type?.title || ''} · ${b.invitee_email || b.invitee_phone || ''}</div>
            ${b.notes_for_agent ? `<div style="color:#888;font-size:11.5px;margin-top:3px;">"${b.notes_for_agent}"</div>` : ''}
          </td>
        </tr>`).join('');

      const html = `
<!DOCTYPE html><html><body style="margin:0;background:#f6f6f4;padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e4;">
    <div style="padding:24px 28px 12px;border-bottom:1px solid #f0f0ec;">
      <div style="color:#D7A542;font-size:11px;letter-spacing:1.5px;font-weight:600;text-transform:uppercase;">Today's Schedule</div>
      <h1 style="margin:6px 0 4px;font-family:Georgia,serif;font-size:22px;color:#14181F;font-weight:500;">${fmtDate(now, tz)}</h1>
      <div style="color:#666;font-size:13px;">Good morning, ${agent.display_name || ''} — ${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} on the calendar.</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="padding:18px 28px;border-top:1px solid #f0f0ec;font-size:11.5px;color:#999;text-align:center;">
      DealzFlow Scheduler · times in ${tz}
    </div>
  </div>
</body></html>`;

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/bridge-send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            to: agent.email,
            subject: `Your day · ${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} today`,
            html,
          }),
        });
        sent++;
      } catch (e) { console.warn('digest send failed', agent.email, e); }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('digest error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
