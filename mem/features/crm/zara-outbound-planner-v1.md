---
name: Zara Outbound Planner v1 (co-pilot mode)
description: Cron-driven outbound draft planner with approval inbox. Zara never sends outbound autonomously — Uzair reviews every draft.
type: feature
---

**Mode**: Co-pilot. Outbound is DRAFT-ONLY, never auto-sent. Inbound `zara-reply` auto-send remains as-is.

**Triggers (in order)** for Zara-assigned (`assigned_to = zara.id`), non-deleted, non `zara:muted` contacts:
1. `new_lead_welcome` — assignment within 5 min, no `last_touch_at`.
2. `presale_burst` — ≥2 events in 7d in `crm_activity_events` (floorplan_download / deck_revisit / email_open) OR any floorplan_download.
3. `post_showing` — `crm_showings.starts_at` between 24–36h ago.
4. `cold_nudge` — `last_touch_at` (or created_at) older than `crm_zara_settings.cold_nudge_days` (default 7).

**Caps** (in `crm_zara_settings`):
- `outbound_planner_enabled` (kill switch)
- `cold_nudge_days` (default 7)
- `max_drafts_per_lead_per_week` (default 2) — counted across ALL statuses
- `max_workspace_pending` (default 50) — workspace-wide pending cap

**Dedupe**: skip if a `pending`|`snoozed` draft for same `(contact_id, trigger_kind)` already exists.

**Schema** — `crm_zara_drafts`:
- channel: email|sms|whatsapp · trigger_kind · subject (email only) · body · reasoning · confidence (0..1)
- status: pending|approved|sent|rejected|snoozed|expired|failed · reject_reason · scheduled_for
- source_event jsonb · send_meta jsonb · approved_by/at · sent_at
- RLS: SELECT/UPDATE gated by `crm_can_see_contact_id(auth.uid(), contact_id)`. No client INSERT/DELETE — service role only.

**Edge fns**:
- `zara-plan-outbound` (POST/cron) — scans candidates, classifies trigger, calls Lovable AI Gateway (`crm_zara_settings.model_draft || model_classify || google/gemini-3-flash-preview`), inserts drafts. Cron `zara-plan-outbound-15m` every 15 min.
- `zara-draft-action` (POST, requires user JWT) — `{draft_id, action: approve|reject|snooze|mute, subject?, body?, reason?, snooze_hours?}`. Approve sends via inlined Gmail-as-Zara (same pattern as `zara-reply`) for email, or invokes `send-sms` with `agent_user_id=zara.id` for sms/whatsapp. Mirrors outbound into `crm_gmail_messages` + `crm_email_log`.

**Channel pick**: email if `contact.email`, else sms; whatsapp not auto-picked (planner v1 picks email/sms only).

**Audit log actions** (`actor_label`):
- `zara.draft_created` (zara), `zara.draft_sent` (uzair), `zara.draft_send_failed` (uzair), `zara.draft_rejected` (uzair), `zara.draft_snoozed` (uzair), `zara.lead_muted` (uzair).

**UI** — `/admin/zara/drafts` (`ZaraDraftsPage`):
- Two-pane: tabbed list (pending/snoozed/sent/rejected/failed) + detail editor.
- Approve/Edit-then-Approve/Reject (with reason)/Snooze 24h/Mute lead.
- Realtime subscription on `crm_zara_drafts` for live updates.
- "Run planner now" button calls `zara-plan-outbound` ad-hoc.
- Linked from Zara dashboard hero `/admin/zara`.

**Manual probe**:
```bash
curl -X POST https://svbilqvudkkdhslxebce.supabase.co/functions/v1/zara-plan-outbound \
  -H "Authorization: Bearer <ANON>" -H "Content-Type: application/json" \
  -d '{"dry_run": true, "limit": 5}'
```
