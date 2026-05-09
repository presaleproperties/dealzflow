# Presale ↔ DealsFlow Integration Contract v2

## Overview
Implement the 3 contract additions presale.com requested, plus the 5 hardening items at the bottom of your message. Everything routes through one new endpoint (`presale-inbound`) so signing, idempotency, and audit logging happen in exactly one place.

---

## 1. New inbound endpoint: `presale-inbound`

Single dispatcher for the new envelope `{ type, occurred_at, idempotency_key, payload }`.

**URL** → `https://<project>.functions.supabase.co/functions/v1/presale-inbound`
(advertise this as `/webhooks/presale-inbound` to presale; Supabase routes by function name.)

**Auth** → `x-presale-signature: sha256=<hex>` where the digest is `HMAC-SHA256(PRESALE_WEBHOOK_SECRET, raw_body)`. Falls back to existing `x-bridge-secret` for legacy calls so we don't break in-flight traffic.

**Supported types** (dispatcher → handler):

| `type` | Action |
|---|---|
| `lead.created` | Existing `bridge-ingest-lead` flow + honor `payload.assigned_agent_id` (skip our round-robin when set) |
| `deck.viewed` | Upsert lead by `lead_id`/`email`/`phone`; insert into `crm_lead_behavior_engagement` (`event_type='deck_visit'`); if `visit_number ≥ 2` add `hot` tag; emit `crm_activity_events` row |
| `booking.scheduled` | Upsert lead, insert `crm_showings` row (or `crm_scheduler_bookings` if `appointment_type` matches an existing event type), set `status='Showing Booked'`, emit timeline event |
| `contract.signed` | Upsert lead, set `status='Won'`, write `lead_value/lead_currency` (new columns) + `won_at`; emit timeline event tagged `contract_signed` |
| `task.claimed` | Mark `crm_tasks.status='claimed'` + `claimed_by/claimed_at`; emit timeline event |

All handlers append to `crm_activity_events` so the existing Lead Timeline v2 picks them up automatically — no UI work needed beyond a small icon/label tweak.

---

## 2. Outbound `task.claimed` ack to presale

When an agent claims/acknowledges a task in DealsFlow (UI button, mobile, SMS reply), trigger a new edge function `crm-notify-presale` that POSTs:

```
POST https://presaleproperties.com/api/crm-inbound
x-presale-signature: sha256=<hex of body>
{ "type": "task.claimed",
  "occurred_at": "<iso>",
  "idempotency_key": "<task_id>:<claimed_at>",
  "payload": { task_id, lead_id, claimed_by_agent_id, claimed_at, ack_token } }
```

Wired by:
- A new "Claim" / "Ack" action on `crm_tasks` (button in TaskRow + new RPC `crm_claim_task(task_id, ack_token?)`)
- A DB trigger on `crm_tasks` UPDATE (`status` → `claimed`) that enqueues into `crm_outbound_webhooks` for retry-safe delivery.

---

## 3. Honor `assigned_agent_id` on `lead.created`

In `bridge-ingest-lead`:
1. If `payload.assigned_agent_id` is present, look up `crm_team` by id → use `display_name` as `assigned_to`.
2. If not found or null, fall back to existing slug→owner→fallback chain.

Already-merged leads keep their existing assignment (we never reassign on merge).

---

## 4. Hardening tasks

### Idempotency dedupe
New table `crm_inbound_events`:
```
idempotency_key text PRIMARY KEY,
event_type text, payload jsonb, signature text,
contact_id uuid, status text, error text,
received_at timestamptz default now()
```
Dispatcher inserts FIRST with `ON CONFLICT DO NOTHING`. If 0 rows inserted → respond `200 {duplicate:true}` without re-running the handler.

### HMAC signature validation
New shared util `_shared/hmac.ts`:
```ts
verifyPresaleSignature(req, rawBody): Promise<boolean>
```
Constant-time compare against `PRESALE_WEBHOOK_SECRET`. Same util used to **sign** outbound posts, so both sides share a single secret.

### Webhook retry & logs
New table `crm_outbound_webhooks`:
```
id, target_url, payload jsonb, signature text,
attempts int, max_attempts int default 5,
next_attempt_at timestamptz, status text,
last_status_code int, last_error text, last_attempt_at
```
+ pg_cron job every minute → `process-outbound-webhooks` edge fn (exp backoff: 30s, 2m, 10m, 1h, 6h).

Inbound logs: every request lands in `crm_inbound_events` regardless of dedupe outcome. New `/admin/integrations/webhook-log` page with last 200 events, status, signature pass/fail.

### Timeline UI exposure
The new event types render automatically via `crm_activity_events` (Lead Timeline v2 already subscribes). Add 4 icon/label entries in `LeadNotesActivity.tsx` + `NoteCard.tsx`:
- `deck_viewed` → 📑 "Viewed deck (visit N)"
- `booking_scheduled` → 📅 "Booked {appointment_type}"
- `contract_signed` → 💰 "Contract signed — ${value}"
- `task_claimed` → ✅ "Task claimed by {agent}"

(Per your editorial-style rule: text-only chips, no emoji in actual UI — colored left-rail labels matching the existing channel pattern.)

### End-to-end webhook tests
New Deno test file `presale-inbound/index.test.ts`:
- Signs a payload with `PRESALE_WEBHOOK_SECRET`, asserts 200
- Replays the same `idempotency_key`, asserts `{duplicate:true}`
- Tampers signature, asserts 401
- One test per event type asserting the right side-effect (lead upsert, status change, timeline insert)

---

## Required secrets

You'll need to add **`PRESALE_WEBHOOK_SECRET`** (shared with presale.com — paste their value here). I'll prompt for it after you approve this plan.

---

## Migration / DB changes summary

Tables added: `crm_inbound_events`, `crm_outbound_webhooks`
Columns added: `crm_contacts.lead_value numeric`, `crm_contacts.lead_currency text`, `crm_contacts.won_at timestamptz`, `crm_tasks.claimed_by uuid`, `crm_tasks.claimed_at timestamptz`, `crm_tasks.ack_token text`, `crm_tasks.lead_external_id text`
Cron: 1-minute job calling `process-outbound-webhooks`

---

## What I need from you

1. **Approve this plan.**
2. After approval, share the `PRESALE_WEBHOOK_SECRET` value (presale.com side has the same string). I'll prompt for it via the secrets tool.
3. Confirm: should `contract.signed` create a row in the **top-level `deals`** table (financial reporting) too, or just stamp the lead `Won`? The presale message only mentions "move the deal to Won" — I default to lead-status-only unless you want both.