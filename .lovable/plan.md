## Goal

Replace the current single-template picker in **Send Project** with the same trigger-based funnel that fires when a lead signs up on PresaleProperties.com — except the agent picks which trigger to fire and the entire follow-up sequence is scheduled and sent from the CRM (so no Presale-side changes needed).

## Canonical triggers (mirrored from `bridge-ingest-lead`)

| Trigger | Fires when (on real signup) | Initial template | Follow-up sequence |
|---|---|---|---|
| `vip_registration` | VIP signup form | VIP welcome | Day 1, Day 3, Day 7 |
| `floor_plan_request` | Floorplan download | Floorplan delivery | Day 1, Day 4 |
| `project_inquiry` | Project inquiry form | Project info | Day 2, Day 5 |
| `contact_form` | Generic contact form | Acknowledgement | Day 2 |
| `deck_revisit_hot` | Deck re-opened (hot rule) | Re-engagement | Day 1, Day 3 |
| `cold_lead_followup` | Manually triggered for stale leads | Cold nudge | Day 7, Day 14 |

Each trigger maps to one of the existing `★`-prefixed Presale auto-templates that `serve-auto-templates` already serves — we just decide which one fires and when. The mapping table is hard-coded in one file (`src/lib/presaleTriggers.ts`) and easy to extend later.

## Architecture

```text
SendProjectDialog (UI)
    ├─ replaces template picker with Trigger picker (dropdown of 6 above)
    ├─ shows the sequence preview ("Sends now + Day 1 + Day 3")
    └─ on Send → invokes edge fn `crm-fire-trigger`
                    │
                    ├─ Render initial via fetch-presale-templates (POST)
                    ├─ Send initial via bridge-send-email (existing)
                    └─ Insert rows into NEW table `crm_scheduled_sends`
                          (one row per follow-up step, status=pending)

NEW edge fn `crm-process-scheduled-sends` (cron every 5 min)
    └─ For each due row: render via fetch-presale-templates,
       send via bridge-send-email, mark sent. Honors unsubscribe + reply.
```

## Files to add / change

**New**
- `src/lib/presaleTriggers.ts` — single source of truth: trigger → template + sequence
- `supabase/functions/crm-fire-trigger/index.ts` — sends initial + queues follow-ups
- `supabase/functions/crm-process-scheduled-sends/index.ts` — cron worker
- DB migration: `crm_scheduled_sends` table (contact_id, trigger_id, step_index, template_slug, project_slug, agent_slug, scheduled_for, status, sent_at, message_id, cancelled_reason) with RLS scoped to assigned agent + admins, plus pg_cron job (every 5 min)

**Changed**
- `src/components/crm/leads/SendProjectDialog.tsx`
  - Replace `templates` query + dropdown with **trigger picker** (Select)
  - Show sequence preview ("This will send now + 2 follow-ups over 4 days")
  - On submit → invoke `crm-fire-trigger` instead of current send path
  - Keep project picker, agent override, Gmail-status check, and existing UX exactly as is

**Auto-cancel rules** (built into `crm-process-scheduled-sends`)
- If lead replies (`crm_email_threads` has new inbound after the trigger fired) → cancel remaining steps
- If lead unsubscribes → cancel remaining steps
- If contact deleted / merged → cancel remaining steps
- Reason recorded in `cancelled_reason` for audit

## What stays untouched

- The "Send Project" button placement and dialog open/close flow
- Project picker UI, Gmail connection check, agent override
- All existing Presale endpoints (no changes on Presale side at all)
- Existing single-shot `★` templates continue to work for ad-hoc sends elsewhere

## What this explicitly does NOT do

- Does not touch Presale's own activity log / scheduling — funnel lives in CRM only
- Does not author new email templates — uses Presale's `serve-auto-templates` for rendering, exactly like today
- No changes to `bridge-ingest-lead` (real signups still trigger Presale's own funnel as they do today)

## Open detail to confirm during build

The mapping in the table above is my best read of the canonical triggers in `bridge-ingest-lead`. When I get to `presaleTriggers.ts` I'll match each trigger's `template_slug` to whatever `serve-auto-templates` actually returns today (live fetch on first load) — if the slug for, say, "VIP welcome" is named differently, I'll log a warning and let you pick the closest match in Settings later. The day-offsets above are sensible defaults; we can tune per trigger after first send.

Ready to build on your go-ahead.
