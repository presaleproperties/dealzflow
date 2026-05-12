---
name: Zara Autonomous Replies v0
description: Inbound auto-reply pipeline for Zara — assigned-only guard, Lovable AI classification, escalate-or-send, full audit trail
type: feature
---
**Zara identity** — `crm_team` row `id=e8d34039-c314-4220-a840-9909a45d2f08`, `slug='zara'`, `email='zara@presaleproperties.com'`, `is_ai=true`. Phone `672-258-1100`. No Gmail OAuth yet → email auto-reply logs an outbound stub only (skips real Gmail send until OAuth wired via gmail-actions).

**Schema additions**
- `crm_team.is_ai` (bool, default false), `crm_team.sender_signature_html` (text)
- `crm_zara_settings` singleton (id=1): `enabled` kill switch, quiet hours (20:00–08:00 America/Vancouver), per-lead+workspace caps, `model_classify`/`model_draft` (default `google/gemini-3-flash-preview`), `system_prompt_version`

**Guard RPC** — `public.zara_can_send_to(_contact_id uuid) returns jsonb` (SECURITY DEFINER, anon revoked). Returns `{allowed, reason, zara_id}`. Reasons: `zara_not_found | kill_switch_off | not_assigned_to_zara | contact_muted | quiet_hours`. Mute tag = `zara:muted` on `crm_contacts.tags`.

**Edge fn `zara-reply`** — POST `{contact_id, channel:'email'|'sms'|'whatsapp', message_text, message_id}`.
1. Calls guard RPC; on block writes `crm_audit_log` `action='zara.blocked'`.
2. Pulls last 5 email+sms history for context.
3. Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`, `LOVABLE_API_KEY`, `response_format: json_object`) returns `{intent, confidence, reply, escalate, language}`.
4. Escalate when `intent ∈ {hot_signal, objection}` OR `confidence < 0.65` OR `escalate=true` OR empty reply: tags contact `hot`, calls `notify_crm` to owner (Uzair), writes `zara.escalation` audit row with `suggested_reply` in meta.
5. Send path: SMS/WhatsApp → invokes existing `send-sms` edge fn with `agent_user_id=zara_id`; email → inserts outbound `crm_gmail_messages` stub. Audit `zara.replied` or `zara.send_failed`.

**Audit log convention** — uses existing `crm_audit_log.action` (NOT `kind` — that column doesn't exist) + `meta` jsonb. Action values: `zara.blocked | zara.escalation | zara.replied | zara.send_failed | zara.error`. `actor_label='zara'`, `record_id=contact_id`.

**Inbound wiring**
- `gmail-sync/index.ts` (after inbound `crm_gmail_messages` insert): if contact's `assigned_to == zara.id`, fire-and-forget `supabase.functions.invoke('zara-reply', {channel:'email'})`.
- `twilio-sms-webhook/index.ts` (after inbound `crm_sms_log` insert): same check, channel = `sms`|`whatsapp`.
Belt-and-suspenders: assignment is checked in handler AND inside guard RPC.

**Models** — Lovable AI Gateway, no Anthropic key yet. To switch to Claude later: add `ANTHROPIC_API_KEY` and update `crm_zara_settings.model_classify`. The edge fn currently always routes to Lovable AI regardless of model name.

**Monitoring queries**
```sql
SELECT occurred_at, action, meta->>'reason' reason, meta->>'intent' intent, meta->>'reply' reply
FROM crm_audit_log WHERE actor_label='zara' ORDER BY occurred_at DESC LIMIT 50;

SELECT count(*) FILTER (WHERE action='zara.replied') AS replied,
       count(*) FILTER (WHERE action='zara.escalation') AS escalated,
       count(*) FILTER (WHERE action='zara.blocked') AS blocked
FROM crm_audit_log WHERE actor_label='zara' AND occurred_at > now() - interval '24 hours';
```

**Manual curl test**
```bash
curl -X POST https://svbilqvudkkdhslxebce.supabase.co/functions/v1/zara-reply \
  -H "Authorization: Bearer <ANON_OR_SERVICE>" \
  -H "Content-Type: application/json" \
  -d '{"contact_id":"<uuid>","channel":"sms","message_text":"what is the price?","message_id":"test1"}'
```
