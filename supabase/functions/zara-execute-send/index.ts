// zara-execute-send — finalizes an approved draft. Sandbox gate refuses real leads.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, levenshtein } from '../_shared/zara-guardrails.ts';
import {
  applyNeverQuote,
  getSendWindow,
  hygiene,
  preflightQA,
} from '../_shared/zara-email-enhance.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ?? '';
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_PHONE_ID = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const authHeader = req.headers.get('authorization') ?? '';
    const { draftId, finalText, decidedBy, decidedVia } = await req.json();
    if (!draftId || !finalText || !decidedVia) return json({ error: 'draftId, finalText, decidedVia required' }, 400);

    const { data: draft } = await admin.from('zara_suggested_replies').select('*').eq('id', draftId).maybeSingle();
    if (!draft) return json({ error: 'draft_not_found' }, 404);
    if (draft.status !== 'pending') return json({ error: 'draft_not_pending', current_status: draft.status }, 409);

    const { data: contact } = await admin.from('crm_contacts').select('*').eq('id', draft.contact_id).maybeSingle();
    if (!contact) return json({ error: 'contact_not_found' }, 404);

    // SANDBOX GATE
    const { data: settings } = await admin.from('zara_settings').select('mode').eq('id', 1).maybeSingle();
    const tags: string[] = contact.tags ?? [];
    const isTestContact = tags.includes('zara_test_contact');
    if (settings?.mode === 'sandbox' && !isTestContact) {
      await admin.from('zara_suggested_replies').update({ status: 'sandbox_blocked' }).eq('id', draftId);
      await admin.from('zara_approval_decisions').insert({
        draft_id: draftId,
        contact_id: draft.contact_id,
        decision: 'approve',
        original_text: draft.draft_text,
        final_text: finalText,
        edit_distance: levenshtein(draft.draft_text, finalText),
        decided_by: decidedBy ?? null,
        decided_via: decidedVia,
      });
      return json({ blocked: true, reason: 'sandbox_real_lead', would_send_to: contact.phone });
    }

    const edit_distance = levenshtein(draft.draft_text, finalText);
    const newStatus = edit_distance === 0 ? 'approved' : 'edited_approved';
    let emailQueued = false;
    let emailQueueId: string | null = null;

    const queueEmail = async (to: string, subject: string, html: string, reason: string, opts: { sendAt?: string; needsReview?: boolean } = {}) => {
      const senderUserId = decidedBy ?? draft.assigned_to ?? null;
      if (!senderUserId) throw new Error(`email_sender_missing; original=${reason}`);
      const { data: queued, error: queueErr } = await admin
        .from('crm_email_schedule')
        .insert({
          contact_id: draft.contact_id,
          template_id: (draft as any).template_id_used ?? null,
          to_emails: [to],
          subject,
          body_html: html,
          send_at: opts.sendAt ?? new Date().toISOString(),
          status: 'pending',
          needs_review: !!opts.needsReview,
          review_reason: opts.needsReview ? reason : null,
          created_by: senderUserId,
        })
        .select('id')
        .single();
      if (queueErr) throw new Error(`email_queue_failed: ${queueErr.message}; original=${reason}`);
      emailQueued = true;
      emailQueueId = queued?.id ?? null;
      // Only kick the processor if it can actually go now
      if (!opts.sendAt && !opts.needsReview) {
        fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ source: 'zara-execute-send', draftId }),
        }).catch((e) => console.warn('[zara-execute-send] email queue kick failed', e));
      }
    };

    // Channel switch
    let sendOk = true;
    let sendErr: string | null = null;
    try {
      if (draft.channel === 'whatsapp') {
        if (!META_TOKEN || !META_PHONE_ID) throw new Error('meta_whatsapp_secrets_missing');
        const res = await fetch(`https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: contact.phone,
            type: 'text',
            text: { body: finalText },
          }),
        });
        if (!res.ok) throw new Error(`whatsapp_send_failed_${res.status}`);
      } else if (draft.channel === 'sms') {
        // SMS uses the existing kill-switched outbound queue
        await admin.from('sms_outbound_queue').insert({
          contact_id: draft.contact_id,
          body: finalText,
          requested_by: decidedBy ?? null,
          status: 'queued',
        });
      } else if (draft.channel === 'email') {
        const to = (contact.email ?? '').trim();
        if (!to) throw new Error('contact_email_missing');
        // Prefer branded HTML draft when present; fall back to plain-text wrapped in a <p>.
        const html: string =
          (draft as any).draft_html && String((draft as any).draft_html).trim().length > 0
            ? String((draft as any).draft_html)
            : `<p style="font-family:Inter,system-ui,sans-serif;white-space:pre-wrap;">${
                finalText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              }</p>`;
        const subject = draft.draft_subject ?? '(no subject)';
        const sendBody = { to, subject, html, contact_id: draft.contact_id, template_id: (draft as any).template_id_used ?? null };
        const canTryImmediate = authHeader.toLowerCase().startsWith('bearer ') && !authHeader.includes(SERVICE_KEY);
        if (!canTryImmediate) {
          await queueEmail(to, subject, html, 'missing_user_auth');
        } else {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/bridge-send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: ANON_KEY },
            body: JSON.stringify(sendBody),
          });
          const text = await res.text();
          if (!res.ok) {
            let detail = text;
            try {
              const parsed = JSON.parse(text);
              detail = parsed?.detail ?? parsed?.error ?? text;
            } catch { /* keep raw text */ }
            console.error('[zara-execute-send] bridge-send-email failed; queueing fallback', { status: res.status, detail });
            await queueEmail(to, subject, html, `bridge_send_failed_${res.status}: ${String(detail).slice(0, 300)}`);
          }
        }
      }
    } catch (e) {
      sendOk = false;
      sendErr = String((e as Error).message);
    }

    // Approval decision log
    await admin.from('zara_approval_decisions').insert({
      draft_id: draftId,
      contact_id: draft.contact_id,
      decision: edit_distance === 0 ? 'approve' : 'edit_approve',
      original_text: draft.draft_text,
      final_text: finalText,
      edit_distance,
      decided_by: decidedBy ?? null,
      decided_via: decidedVia,
    });

    if (!sendOk) {
      await admin.from('zara_suggested_replies').update({ status: 'pending' }).eq('id', draftId);
      return json({ ok: false, error: 'send_failed', detail: sendErr, fallback: true }, 200);
    }

    // Update draft + log engagement event.
    // Phase 1 analytics: persist edited_text + edit_distance onto the draft row
    // so dashboards can compute acceptance rate without a join.
    const sent_at = new Date().toISOString();
    await admin
      .from('zara_suggested_replies')
      .update({
        status: emailQueued ? newStatus : 'sent',
        sent_at: emailQueued ? null : sent_at,
        approved_by: decidedBy ?? null,
        approved_at: sent_at,
        approval_method: decidedVia,
        edited_text: finalText,
        edit_distance,
      })
      .eq('id', draftId);

    admin
      .from('crm_engagement_events')
      .insert({
        contact_id: draft.contact_id,
        event_type: emailQueued ? `${draft.channel}_queued` : `${draft.channel}_sent`,
        source: 'zara',
        actor_id: decidedBy ?? null,
        direction: 'outbound',
        metadata: { draft_id: draftId, intent: draft.intent, edit_distance, zara_assisted: true, queued: emailQueued, queue_id: emailQueueId },
      })
      .then(() => {});

    // Roll per-lead memory with the approved outbound text (fire-and-forget).
    fetch(`${SUPABASE_URL}/functions/v1/zara-roll-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        contact_id: draft.contact_id,
        inbound_text: draft.inbound_text ?? null,
        outbound_text: finalText,
        kind: 'send',
      }),
    }).catch((e) => console.warn('[zara-execute-send] roll-memory kick failed', e));

    return json({ ok: true, status: emailQueued ? newStatus : 'sent', queued: emailQueued, queue_id: emailQueueId, edit_distance, sent_at: emailQueued ? null : sent_at });
  } catch (e) {
    console.error('[zara-execute-send]', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
