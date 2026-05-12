// Per-lead full history CSV export.
// Validates caller can see the contact via crm_can_see_contact_id.
// Pulls profile + notes + emails + sms + calls + showings + activity + audit.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface Section { name: string; columns: string[]; rows: Array<Record<string, unknown>> }

function buildCsv(sections: Section[]): string {
  const out: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (i > 0) out.push('');
    out.push(`## ${s.name}`);
    if (!s.columns.length) { out.push('(no columns)'); continue; }
    out.push(s.columns.map(escapeCell).join(','));
    if (!s.rows.length) { out.push('(no rows)'); continue; }
    for (const r of s.rows) out.push(s.columns.map((c) => escapeCell(r[c])).join(','));
  }
  return out.join('\n') + '\n';
}

async function loadAll(client: ReturnType<typeof createClient>, table: string, contactId: string, fkCol = 'contact_id') {
  const { data, error } = await client.from(table).select('*').eq(fkCol, contactId).order('created_at', { ascending: true });
  if (error) {
    console.error(`[crm-export-lead] ${table} fetch failed`, error.message);
    return [] as Array<Record<string, unknown>>;
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: auth } } }
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id as string | undefined;
    if (!contactId) {
      return new Response(JSON.stringify({ error: 'contact_id required' }), { status: 400, headers: corsHeaders });
    }

    // Permission gate via the SECURITY DEFINER helper (covers admin + soft-deleted rules)
    const { data: canSee, error: canSeeErr } = await admin.rpc('crm_can_see_contact_id', {
      _user_id: userId,
      _contact_id: contactId,
    });
    if (canSeeErr) throw canSeeErr;
    if (!canSee) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    // Profile
    const { data: contact, error: cErr } = await admin.from('crm_contacts').select('*').eq('id', contactId).maybeSingle();
    if (cErr) throw cErr;
    if (!contact) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders });
    }

    // Pull related logs in parallel — fail-soft per source
    const [notes, emails, sms, calls, showings, activity, audit] = await Promise.all([
      loadAll(admin, 'crm_notes', contactId),
      loadAll(admin, 'crm_email_log', contactId),
      loadAll(admin, 'crm_sms_log', contactId),
      loadAll(admin, 'crm_call_log', contactId),
      loadAll(admin, 'crm_showings', contactId),
      loadAll(admin, 'crm_activity_events', contactId),
      admin.from('crm_audit_log').select('*').eq('record_id', contactId).order('occurred_at', { ascending: true })
        .then(r => (r.data ?? []) as Array<Record<string, unknown>>),
    ]);

    const profileCols = Object.keys(contact);
    const sections: Section[] = [
      { name: 'Profile', columns: profileCols, rows: [contact as Record<string, unknown>] },
      { name: 'Notes',           columns: notes[0]   ? Object.keys(notes[0])   : ['id','body','created_at'],   rows: notes },
      { name: 'Emails',          columns: emails[0]  ? Object.keys(emails[0])  : ['id','subject','status','created_at'], rows: emails },
      { name: 'SMS',             columns: sms[0]     ? Object.keys(sms[0])     : ['id','direction','body','created_at'], rows: sms },
      { name: 'Calls',           columns: calls[0]   ? Object.keys(calls[0])   : ['id','direction','duration_sec','created_at'], rows: calls },
      { name: 'Showings',        columns: showings[0]? Object.keys(showings[0]): ['id','showing_date','showing_time'], rows: showings },
      { name: 'Activity Events', columns: activity[0]? Object.keys(activity[0]): ['id','event_type','created_at'], rows: activity },
      { name: 'Audit Log',       columns: audit[0]   ? Object.keys(audit[0])   : ['id','action','occurred_at'], rows: audit },
    ];

    const csv = buildCsv(sections);

    // Best-effort: log the export
    try {
      await admin.rpc('crm_log_bulk_op', {
        _action: 'export_lead',
        _affected: 1,
        _filter: { contact_id: contactId },
        _meta: { sections: sections.map(s => ({ name: s.name, count: s.rows.length })) },
        _job_id: null,
      });
    } catch (e) {
      console.error('[crm-export-lead] audit log failed', e);
    }

    const safeName = `${contact.first_name ?? 'lead'}-${contact.last_name ?? ''}-${contactId.slice(0, 8)}`
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.csv"`,
      },
    });
  } catch (err) {
    console.error('[crm-export-lead] error', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
