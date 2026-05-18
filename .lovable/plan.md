## SMS Major Update — Telnyx everywhere + Zara SMS

Goal: every SMS path in the app (single, bulk, scheduled, Zara) uses Telnyx (`telnyx-send-message`). Zara can draft, send (autonomy-gated), and read SMS context. Inbound replies notify the assigned agent and ask Zara for a suggested reply.

### What's broken / disabled today
- `bulk-send-sms`, `process-scheduled-sms` — return `disabled: 410` stubs (Twilio-era no-ops)
- `zara-execute-send` SMS branch — inserts into dead `sms_outbound_queue` table; nothing ever sends
- `zara-execute-send` WhatsApp branch — calls Meta Graph (removed); should route through Telnyx
- `get-zara-context` returns no SMS history → Zara writes drafts blind on SMS replies
- Inbound webhook stores the message but never triggers a Zara suggested reply

### Backend (edge functions)

1. **Rewrite `bulk-send-sms`** → real Telnyx batch:
   - Inputs: `{ contact_ids?, filter?, body, media_urls?, channel?, scheduled_for?, throttle_per_min?, dry_run?, name }`
   - Resolve recipients (mirror existing `crm-mass-send-email` resolver pattern), apply opt-outs + quiet-hours per recipient, render merge tokens (`{{first_name}}`, `{$first_name}`, `${first_name}`)
   - For each: call `telnyx-send-message` with caller's JWT, `client_dedupe_id = campaign_id + ":" + contact_id`
   - Insert `crm_sms_campaigns` row; update sent/failed counters as we go
   - Honor `scheduled_for` by inserting `crm_sms_schedule` rows instead of sending now

2. **Rewrite `process-scheduled-sms`** → drain `crm_sms_schedule` (status `pending` + `send_at <= now()`), call `telnyx-send-message` via service role + impersonated user JWT (reuse same pattern as `process-scheduled-emails`)

3. **Fix `zara-execute-send` SMS branch**:
   - Replace `sms_outbound_queue` insert with `fetch(.../telnyx-send-message)` using forwarded auth header
   - On failure → mark draft `pending` (current fallback path)
   - WhatsApp branch: same call, `channel: 'whatsapp'` (drops Meta dependency entirely)

4. **Zara tool: `send_sms_now`** (new) in `zara-chat` tool list, autonomy-gated:
   - High autonomy → executes immediately via `telnyx-send-message`
   - Low/medium autonomy → falls back to existing `draft_sms` (no behavior change)
   - Reuses `zara_effective_autonomy(uid)` helper that email already uses
   - Existing `draft_sms` → `zara-execute-send` flow stays as the approval path

5. **`get-zara-context`** — add `recentSms` (last 20 `crm_sms_log` rows for contact, both directions, channel sms+whatsapp). `zara-chat` system prompt builder includes a `RECENT SMS THREAD` block when present.

6. **Inbound auto-suggest** — at end of `telnyx-messaging-webhook` inbound branch, when `contactId` + `assignedUserId` resolved:
   - Fire-and-forget POST to `zara-suggest-reply` `{ contact_id, channel, inbound_text, assigned_to }`
   - Fire `crm_send_notification` via the existing `crm_recipients_for_contact` RPC (assigned-agent-only, per memory rule)

### Frontend

7. **`useSms.tsx`** — already routes single sends through `send-sms` (proxy → `telnyx-send-message`). No change needed for single sends. `useBulkSendSms` continues invoking `bulk-send-sms`; new implementation makes it actually work.

8. **`SendTextDialog` / `BulkSendTextDialog`** — drop the "Twilio removed" comments + disabled banners. Remove the staged-queue admin gate for bulk (Telnyx doesn't have the same fraud profile; keep quiet-hours + opt-out checks).

9. **Lead detail Zara dock** — `RemembersCard` already shows continuity openers; add a small "Recent texts" line when `recentSms.length > 0` (one-liner, no UI overhaul).

### Database

10. Migration:
    - Create `crm_sms_schedule` (id, user_id, contact_id, body, media_urls[], channel, send_at, status, campaign_id, attempts, last_error, timestamps) with RLS scoped to `auth.uid() = user_id`
    - Re-enable pg_cron: `process-scheduled-sms` every minute (replaces the no-op cron)
    - Drop unused `sms_outbound_queue` if present (only Zara wrote to it; nothing reads it)

### Out of scope (explicit)
- Voice / dialer — already deferred per earlier turn
- Bulk WhatsApp — single WhatsApp sends keep working via Telnyx, bulk stays SMS-only for now
- New SMS Center redesign — only wiring/bug-fix work

### Files touched
```
supabase/functions/bulk-send-sms/index.ts            (rewrite)
supabase/functions/process-scheduled-sms/index.ts    (rewrite)
supabase/functions/zara-execute-send/index.ts        (SMS + WhatsApp branches)
supabase/functions/zara-chat/index.ts                (add send_sms_now tool + autonomy gate)
supabase/functions/get-zara-context/index.ts         (recentSms)
supabase/functions/telnyx-messaging-webhook/index.ts (inbound → suggest-reply + notify)
src/hooks/useSms.tsx                                  (clean up disabled paths)
src/components/crm/leads/SendTextDialog.tsx           (remove disabled copy)
src/components/crm/leads/BulkSendTextDialog.tsx       (remove disabled copy)
src/components/crm/leads/BulkActionsBar.tsx           (remove disabled copy)
src/components/crm/zara/RemembersCard.tsx             (recent texts hint)
migration: crm_sms_schedule + cron + drop sms_outbound_queue
```

### Verification
- Send single SMS from lead detail → arrives, logs `delivered` after webhook
- Bulk send to 3 leads from Leads page → 3 sends, campaign counters update
- Zara draft_sms → approve from Today inbox → arrives via Telnyx (no more dead queue)
- Zara on high autonomy with `send_sms_now` → immediate send + logged decision
- Inbound reply → notification fires to assigned agent + a Zara suggested reply lands in Today
