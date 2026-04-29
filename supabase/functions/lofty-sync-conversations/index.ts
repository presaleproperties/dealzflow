// Lofty → DealzFlow conversation sync
//
// Pulls email / SMS / call history for a single contact (or a batch of
// contacts) from the Lofty Open API and inserts them into our
// `crm_email_log`, `crm_sms_log`, and `crm_notes` tables.
//
// External IDs are stored with a `lofty:` prefix in existing external-id
// columns so re-running the sync is idempotent:
//   - crm_email_log.gmail_message_id  = "lofty:<email_id>"
//   - crm_sms_log.twilio_message_sid  = "lofty:<text_id>"
//   - crm_notes.content begins with   "[lofty-call:<id>]"  for calls
//
// Auth: uses LOFTY_API_KEY (Settings → Integrations → API in Lofty).
// Header format per Lofty docs: `Authorization: token <API_KEY>`.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOFTY_BASE = 'https://api.lofty.com';

type ContactRow = {
  id: string;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  phone_normalized: string | null;
  lofty_id: string | null;
  assigned_to: string | null;
};

function digits(s: string | null | undefined): string {
  return (s || '').replace(/\D+/g, '');
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loftyFetch(path: string, apiKey: string, params?: Record<string, string | number>) {
  const url = new URL(`${LOFTY_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: json?.message || text || `HTTP ${res.status}` };
  }
  return { ok: true as const, data: json };
}

/** Try to resolve a Lofty leadId for a given contact using whatever we know. */
async function resolveLoftyLeadId(contact: ContactRow, apiKey: string): Promise<string | null> {
  if (contact.lofty_id) return contact.lofty_id;
  // Lofty's lead search supports email + phone keywords. We try email first,
  // then phone (digits-only). Endpoints inferred from Lofty Open API docs.
  const emails = [contact.email, contact.email_secondary].filter(Boolean) as string[];
  const phones = [contact.phone_normalized, contact.phone, contact.phone_secondary]
    .filter(Boolean)
    .map((p) => digits(p as string))
    .filter((p) => p.length >= 7);

  for (const email of emails) {
    const r = await loftyFetch('/v1.0/leads/search', apiKey, { keyword: email, pageSize: 5 });
    if (r.ok) {
      const items = r.data?.data?.items || r.data?.items || r.data?.data || [];
      const hit = items.find((it: any) =>
        (it.email || '').toLowerCase() === email.toLowerCase() ||
        (it.emails || []).some((e: any) => (e?.email || '').toLowerCase() === email.toLowerCase()),
      );
      if (hit?.id) return String(hit.id);
      if (items[0]?.id) return String(items[0].id);
    }
  }
  for (const phone of phones) {
    const r = await loftyFetch('/v1.0/leads/search', apiKey, { keyword: phone, pageSize: 5 });
    if (r.ok) {
      const items = r.data?.data?.items || r.data?.items || r.data?.data || [];
      const hit = items.find((it: any) =>
        digits(it.phone) === phone ||
        (it.phones || []).some((p: any) => digits(p?.phone) === phone),
      );
      if (hit?.id) return String(hit.id);
      if (items[0]?.id) return String(items[0].id);
    }
  }
  return null;
}

/** Strip raw HTML to a clean preview-safe text snippet. */
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

type SyncCounts = { emails: number; texts: number; calls: number; skipped: number };

async function syncOneContact(
  contact: ContactRow,
  loftyLeadId: string,
  apiKey: string,
  admin: ReturnType<typeof createClient>,
): Promise<SyncCounts> {
  const counts: SyncCounts = { emails: 0, texts: 0, calls: 0, skipped: 0 };

  // ---------- EMAILS ----------
  const emailRes = await loftyFetch('/v1.0/leads/email/search', apiKey, {
    leadId: loftyLeadId,
    pageSize: 200,
  });
  if (emailRes.ok) {
    const items: any[] =
      emailRes.data?.data?.items || emailRes.data?.items || emailRes.data?.data || [];

    if (items.length) {
      const externalIds = items.map((e) => `lofty:${e.id}`);
      const { data: existing } = await admin
        .from('crm_email_log')
        .select('gmail_message_id')
        .in('gmail_message_id', externalIds);
      const have = new Set((existing ?? []).map((r: any) => r.gmail_message_id));

      const rows = items
        .filter((e) => !have.has(`lofty:${e.id}`))
        .map((e) => {
          const direction = (e.direction || e.type || '').toString().toLowerCase().includes('in')
            ? 'inbound' : 'outbound';
          const sentAt =
            e.sentAt || e.sent_at || e.createdAt || e.created_at || new Date().toISOString();
          const fromAddr = e.from || e.fromEmail || e.sender || '';
          const toAddr = e.to || e.toEmail || e.recipient || '';
          const bodyHtml = e.bodyHtml || e.htmlBody || e.body || e.content || '';
          const subject = e.subject || '(no subject)';
          // We don't have separate from/to columns on crm_email_log; fold them
          // into the body so the EmailPreviewDialog renders the full context.
          const headerBlock = `<div style="font-size:12px;color:#666;margin-bottom:8px;">` +
            `<div><strong>From:</strong> ${fromAddr || '—'}</div>` +
            `<div><strong>To:</strong> ${toAddr || '—'}</div>` +
            `<div><strong>Date:</strong> ${new Date(sentAt).toLocaleString()}</div>` +
            `</div>`;
          return {
            contact_id: contact.id,
            user_id: contact.assigned_to && /^[0-9a-f-]{36}$/i.test(contact.assigned_to)
              ? contact.assigned_to : null,
            subject,
            body: headerBlock + (typeof bodyHtml === 'string' ? bodyHtml : ''),
            direction,
            sent_at: sentAt,
            gmail_message_id: `lofty:${e.id}`,
          };
        });

      if (rows.length) {
        const { error } = await admin.from('crm_email_log').insert(rows);
        if (!error) counts.emails += rows.length;
        else console.error('email insert error', error);
      }
      counts.skipped += items.length - rows.length;
    }
  } else {
    console.warn('lofty email search failed', emailRes.status, emailRes.error);
  }

  // ---------- TEXTS / SMS ----------
  const textRes = await loftyFetch('/v1.0/leads/text/search', apiKey, {
    leadId: loftyLeadId,
    pageSize: 200,
  });
  if (textRes.ok) {
    const items: any[] =
      textRes.data?.data?.items || textRes.data?.items || textRes.data?.data || [];

    if (items.length) {
      const externalIds = items.map((t) => `lofty:${t.id}`);
      const { data: existing } = await admin
        .from('crm_sms_log')
        .select('twilio_message_sid')
        .in('twilio_message_sid', externalIds);
      const have = new Set((existing ?? []).map((r: any) => r.twilio_message_sid));

      const rows = items
        .filter((t) => !have.has(`lofty:${t.id}`))
        .map((t) => {
          const direction = (t.direction || t.type || '').toString().toLowerCase().includes('in')
            ? 'inbound' : 'outbound';
          const sentAt =
            t.sentAt || t.sent_at || t.createdAt || t.created_at || new Date().toISOString();
          return {
            contact_id: contact.id,
            user_id: contact.assigned_to && /^[0-9a-f-]{36}$/i.test(contact.assigned_to)
              ? contact.assigned_to : null,
            channel: 'sms',
            direction,
            from_number: t.from || t.fromNumber || null,
            to_number: t.to || t.toNumber || null,
            body: t.content || t.body || t.message || '',
            status: 'delivered',
            twilio_message_sid: `lofty:${t.id}`,
            sent_at: sentAt,
            message_type: 'lofty_import',
          };
        });

      if (rows.length) {
        const { error } = await admin.from('crm_sms_log').insert(rows);
        if (!error) counts.texts += rows.length;
        else console.error('sms insert error', error);
      }
      counts.skipped += items.length - rows.length;
    }
  } else {
    console.warn('lofty text search failed', textRes.status, textRes.error);
  }

  // ---------- CALLS ----------
  const callRes = await loftyFetch('/v2.0/leads/call/search', apiKey, {
    leadId: loftyLeadId,
    pageSize: 200,
  });
  if (callRes.ok) {
    const items: any[] =
      callRes.data?.data?.items || callRes.data?.items || callRes.data?.data || [];
    if (items.length) {
      // Dedupe by scanning existing notes for the marker. Faster than per-row
      // selects for typical contact volumes.
      const { data: existingNotes } = await admin
        .from('crm_notes')
        .select('content')
        .eq('contact_id', contact.id)
        .eq('note_type', 'call_log')
        .ilike('content', '[lofty-call:%');
      const have = new Set<string>();
      for (const n of (existingNotes ?? []) as any[]) {
        const m = /\[lofty-call:([^\]]+)\]/.exec(n.content || '');
        if (m) have.add(m[1]);
      }

      const rows = items
        .filter((c) => !have.has(String(c.id)))
        .map((c) => {
          const ts = c.callTime || c.startTime || c.createdAt || c.created_at || new Date().toISOString();
          const direction = (c.direction || c.type || '').toString().toLowerCase();
          const dirLabel = direction.includes('in') ? 'Inbound' : direction.includes('out') ? 'Outbound' : 'Call';
          const dur = c.duration || c.talkTime || 0;
          const note = c.note || c.notes || c.summary || '';
          const recording = c.recordingUrl || c.recording_url || '';
          const lines = [
            `[lofty-call:${c.id}]`,
            `${dirLabel} call · ${dur ? `${dur}s` : 'no duration'}`,
            note ? `\nNotes: ${note}` : '',
            recording ? `\nRecording: ${recording}` : '',
          ].filter(Boolean);
          return {
            contact_id: contact.id,
            user_id: contact.assigned_to && /^[0-9a-f-]{36}$/i.test(contact.assigned_to)
              ? contact.assigned_to : null,
            content: lines.join('\n'),
            note_type: 'call_log',
            event_at: ts,
          };
        });

      if (rows.length) {
        const { error } = await admin.from('crm_notes').insert(rows);
        if (!error) counts.calls += rows.length;
        else console.error('call insert error', error);
      }
      counts.skipped += items.length - rows.length;
    }
  } else {
    console.warn('lofty call search failed', callRes.status, callRes.error);
  }

  // Persist resolved lofty_id so future syncs skip the search step.
  if (!contact.lofty_id && loftyLeadId) {
    await admin.from('crm_contacts')
      .update({ lofty_id: loftyLeadId, lofty_synced_at: new Date().toISOString() })
      .eq('id', contact.id);
  } else {
    await admin.from('crm_contacts')
      .update({ lofty_synced_at: new Date().toISOString() })
      .eq('id', contact.id);
  }

  return counts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOFTY_API_KEY');
    if (!apiKey) return ok({ error: 'LOFTY_API_KEY is not configured' }, 500);

    // Auth check — only signed-in CRM users may trigger.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return ok({ error: 'Unauthorized' }, 401);

    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims) return ok({ error: 'Unauthorized' }, 401);

    const admin = createClient(supaUrl, serviceKey);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const contactId: string | undefined = body.contactId;
    const limit: number = Math.min(Math.max(Number(body.limit ?? 1), 1), 50);

    // Build the contact list
    let query = admin
      .from('crm_contacts')
      .select('id, email, email_secondary, phone, phone_secondary, phone_normalized, lofty_id, assigned_to')
      .limit(limit);
    if (contactId) {
      query = query.eq('id', contactId);
    } else {
      // Bulk mode: prefer contacts that already have a lofty_id, then
      // those that look like a Lofty origin but have not been synced yet.
      query = query.not('lofty_id', 'is', null);
    }
    const { data: contacts, error: cErr } = await query;
    if (cErr) return ok({ error: cErr.message }, 500);
    if (!contacts || contacts.length === 0) return ok({ ok: true, results: [], message: 'No contacts to sync' });

    const results: Array<{ contactId: string; loftyLeadId: string | null; counts?: SyncCounts; error?: string }> = [];

    for (const c of contacts as ContactRow[]) {
      try {
        const leadId = await resolveLoftyLeadId(c, apiKey);
        if (!leadId) {
          results.push({ contactId: c.id, loftyLeadId: null, error: 'No matching Lofty lead found' });
          continue;
        }
        const counts = await syncOneContact(c, leadId, apiKey, admin);
        results.push({ contactId: c.id, loftyLeadId: leadId, counts });
      } catch (e: any) {
        console.error('sync contact failed', c.id, e);
        results.push({ contactId: c.id, loftyLeadId: null, error: e?.message || 'sync failed' });
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        if (r.counts) {
          acc.emails += r.counts.emails;
          acc.texts += r.counts.texts;
          acc.calls += r.counts.calls;
          acc.skipped += r.counts.skipped;
        }
        return acc;
      },
      { emails: 0, texts: 0, calls: 0, skipped: 0 },
    );

    return ok({ ok: true, totals, results });
  } catch (e: any) {
    console.error('lofty-sync-conversations fatal', e);
    return ok({ error: e?.message || 'Internal error' }, 500);
  }
});
