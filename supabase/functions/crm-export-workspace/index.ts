// Workspace-wide history export — admin only.
// Streams a ZIP with one folder per (non-deleted) contact + root contacts.csv,
// audit_log.csv, team.csv. Uploads to crm-exports bucket and returns a 7-day
// signed URL. Audit row written.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// jszip works in Deno via esm.sh; produces a single Uint8Array.
import JSZip from 'https://esm.sh/jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') { try { s = JSON.stringify(v); } catch { s = String(v); } }
  else s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>, fallbackCols: string[] = []): string {
  if (!rows.length) return fallbackCols.join(',') + '\n';
  const cols = Object.keys(rows[0]);
  const out: string[] = [cols.map(escapeCell).join(',')];
  for (const r of rows) out.push(cols.map((c) => escapeCell(r[c])).join(','));
  return out.join('\n') + '\n';
}

function safeSlug(s: string): string {
  return (s || 'lead').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const { data: isAdmin, error: roleErr } = await admin.rpc('is_crm_admin_or_owner', { _uid: userId });
    if (roleErr) throw roleErr;
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    // Pull contacts (excluding soft-deleted), team, and audit log
    const [{ data: contacts = [] }, { data: team = [] }, { data: auditAll = [] }] = await Promise.all([
      admin.from('crm_contacts').select('*').is('deleted_at', null).order('created_at', { ascending: true }),
      admin.from('crm_team').select('id,user_id,display_name,email,role,is_active'),
      admin.from('crm_audit_log').select('*').order('occurred_at', { ascending: false }).limit(50000),
    ]);

    const zip = new JSZip();
    zip.file('contacts.csv', rowsToCsv(contacts as Array<Record<string, unknown>>));
    zip.file('team.csv',     rowsToCsv(team as Array<Record<string, unknown>>));
    zip.file('audit_log.csv',rowsToCsv(auditAll as Array<Record<string, unknown>>));

    // Per-contact subfolders — fail-soft per source
    for (const c of contacts as Array<Record<string, unknown>>) {
      const id = String(c.id);
      const folder = `leads/${safeSlug(`${c.first_name}-${c.last_name}-${id.slice(0,8)}`)}`;
      const z = zip.folder(folder)!;
      z.file('profile.csv', rowsToCsv([c]));

      const tables: Array<[string, string]> = [
        ['notes', 'crm_notes'],
        ['emails', 'crm_email_log'],
        ['sms', 'crm_sms_log'],
        ['calls', 'crm_call_log'],
        ['showings', 'crm_showings'],
        ['activity', 'crm_activity_events'],
      ];
      for (const [outName, table] of tables) {
        try {
          const { data } = await admin.from(table).select('*').eq('contact_id', id);
          z.file(`${outName}.csv`, rowsToCsv((data ?? []) as Array<Record<string, unknown>>));
        } catch (e) {
          console.error(`[crm-export-workspace] ${table} for ${id}`, e);
        }
      }
      try {
        const { data } = await admin.from('crm_audit_log').select('*').eq('record_id', id).order('occurred_at', { ascending: true });
        z.file('audit.csv', rowsToCsv((data ?? []) as Array<Record<string, unknown>>));
      } catch (e) {
        console.error('[crm-export-workspace] audit fetch failed', e);
      }
    }

    const buf = await zip.generateAsync({ type: 'uint8array' });

    const today = new Date().toISOString().slice(0, 10);
    const jobId = crypto.randomUUID();
    const objectPath = `${today}/workspace-${jobId}.zip`;

    const { error: upErr } = await admin.storage.from('crm-exports').upload(objectPath, buf, {
      contentType: 'application/zip',
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await admin.storage
      .from('crm-exports')
      .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
    if (signErr) throw signErr;

    try {
      await admin.rpc('crm_log_bulk_op', {
        _action: 'export_workspace',
        _affected: contacts.length,
        _filter: { include_deleted: false },
        _meta: { object: objectPath, size_bytes: buf.byteLength },
        _job_id: jobId,
      });
    } catch (e) {
      console.error('[crm-export-workspace] audit log failed', e);
    }

    return new Response(JSON.stringify({
      ok: true,
      url: signed?.signedUrl ?? null,
      object_path: objectPath,
      contacts: contacts.length,
      size_bytes: buf.byteLength,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[crm-export-workspace] error', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
