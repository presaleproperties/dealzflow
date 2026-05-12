# Phase 1.5 — Lead data safety, audit & full-history export

Three independent workstreams, all admin-gated for destructive/export actions.

---

## 1. Soft-delete + Trash + 30-day purge (crm_contacts)

### Schema
- Add `deleted_at timestamptz` + `deleted_by uuid` to `crm_contacts`.
- Index: `crm_contacts_deleted_at_idx` on `(deleted_at) where deleted_at is not null`.
- Update `crm_can_see_contact_id(uuid)` to return `false` for soft-deleted rows when caller is **not** `is_crm_admin_or_owner()`. Admins can see + restore + hard-delete.
- All existing list/search RPCs (`crm_search_leads`, kanban queries, segment counts, dashboards, exports, mass-send recipient resolution) get `deleted_at IS NULL` filters. Audit hits via `rg "from\\('crm_contacts'\\)"`.

### RPCs (SECURITY DEFINER)
- `crm_soft_delete_contacts(_ids uuid[]) returns int` — admin-only; sets `deleted_at=now(), deleted_by=auth.uid()`. Writes one bulk-op audit row.
- `crm_restore_contacts(_ids uuid[]) returns int` — admin-only; sets `deleted_at=NULL, deleted_by=NULL`. Audit row.
- `crm_hard_delete_contacts(_ids uuid[]) returns int` — admin-only; only allowed on rows already soft-deleted. Audit row (snapshot of basic fields before delete).

### Trash UI
- New segment `trash` in `/crm/leads` (admin-only chip in segment row, hidden for agents).
- Reuses LeadsTable; row actions become **Restore** / **Delete forever** (confirm dialog).
- Bulk bar gains the same two actions when segment=trash.
- Empty state: "Leads stay in Trash for 30 days, then are permanently removed."

### 30-day purge cron
- New edge fn `crm-purge-trash` — service role; deletes contacts where `deleted_at < now() - interval '30 days'`. Writes one audit row per run with affected_count.
- pg_cron daily at 03:15 UTC (insert tool, not migration — contains anon key).

---

## 2. Audit log — mutations + bulk ops

### Schema
```
crm_audit_log (
  id uuid pk,
  occurred_at timestamptz default now(),
  actor_id uuid,                    -- auth.uid() at time of write
  actor_label text,                 -- denormalized crm_team display_name
  action text not null,             -- 'insert'|'update'|'delete'|'soft_delete'|'restore'|'hard_delete'|'bulk_reassign'|'bulk_import'|'bulk_tag'|'bulk_delete'|'purge'
  table_name text not null,         -- 'crm_contacts' for now
  record_id uuid,                   -- null for bulk
  before jsonb,                     -- null for insert / bulk
  after  jsonb,                     -- null for delete / bulk
  changed_fields text[],            -- diff keys for updates
  bulk_job_id uuid,                 -- groups a bulk operation
  bulk_op text,                     -- mirrors action for bulk
  affected_count int,
  filter_snapshot jsonb,            -- segment/search/ids that drove the bulk op
  meta jsonb default '{}'
);
```
- RLS: SELECT for `is_crm_admin_or_owner()` OR `actor_id = auth.uid()` OR (record_id maps to a contact the caller can see). INSERT only via SECURITY DEFINER helpers (no direct client writes).

### Triggers
- `crm_audit_contacts_trg` AFTER INSERT/UPDATE/DELETE on `crm_contacts`. Skips when `current_setting('app.skip_audit', true) = 'on'` (matches existing `app.skip_touch` precedent so import jobs can opt out where appropriate). Diff = keys whose values differ; PII columns (email, phone, address) recorded as before/after.

### Bulk-op logging
- Helper `crm_log_bulk_op(_action text, _affected int, _filter jsonb, _meta jsonb default '{}')` SECURITY DEFINER.
- Wired into existing bulk RPCs/edge fns: bulk reassign, bulk tag, bulk delete (soft+hard), import, purge cron, mass send is **not** included (owns its own send log).

### Surfacing
- Lead Detail timeline (v2): new `crm_lead_timeline_v2` source row type `audit` — renders as compact "Field X: A → B by Sarb · 3m ago" entries. Included only for admins (agents already see their own changes via existing activity).
- Admin-only `/admin/audit` page: paginated table with filters (actor, action, date range). Reuses existing admin layout primitives — no new design tokens.

---

## 3. Full-history export

### Per-lead CSV (everyone with view access)
- Edge fn `crm-export-lead` — input `{contact_id}`. Validates `crm_can_see_contact_id`. Pulls profile + crm_notes + crm_email_log + crm_sms_log + crm_call_log + crm_showings + crm_activity_events + audit rows. Returns multi-section CSV (one CSV file with `## section` separators — single download, fits the answered "Single CSV per lead").
- Button in Lead Detail header overflow menu → triggers download.
- Audit row written: `action='export_lead'`.

### Workspace ZIP (admin-only)
- New private storage bucket `crm-exports` (no public read; signed URL only).
- Edge fn `crm-export-workspace` — admin-gated. Streams: one folder per non-deleted contact with the same files as per-lead, plus root `contacts.csv`, `audit_log.csv`, `team.csv`. Uses `jsr:@zip-js/zip-js` (already pattern-compatible with edge runtime; if unavailable, fall back to a hand-rolled ZIP via `Deno.readAll` of in-memory entries).
- Uploads to `crm-exports/{yyyy-mm-dd}/{job_id}.zip`, returns 7-day signed URL.
- Admin Settings → Data → "Export workspace history" button. Shows progress toast; on completion, copies signed URL + sends in-app notification to caller.
- Audit row: `action='export_workspace'` with `affected_count`.

---

## Permissions matrix
| Action | Agent | Admin/Owner |
|---|---|---|
| View own leads | yes | yes (all) |
| Soft-delete | no | yes |
| See Trash segment | no | yes |
| Restore | no | yes |
| Hard-delete | no | yes |
| Per-lead CSV export | yes (their leads) | yes |
| Workspace ZIP export | no | yes |
| Audit log page | no | yes |

---

## Tests
- Vitest: CSV builder for per-lead export (sections render, escape commas/newlines, empty sections OK).
- Deno: 
  - `crm_soft_delete_contacts` — non-admin returns 0/raises; admin sets timestamps; restore clears them.
  - `crm_hard_delete_contacts` — refuses on rows that aren't soft-deleted.
  - Trigger: update on contact writes audit row with diff; `app.skip_audit=on` suppresses it.
  - `crm-purge-trash` deletes only rows older than 30d.

---

## Out of scope (explicitly)
- No new design tokens, fonts, libraries — Trash segment, audit timeline, exports reuse `<Pill>`, ResponsiveDialog, existing admin table primitives, sonner toasts.
- Mass-send log is unchanged.
- No read-of-PII auditing (you picked mutation+bulk only).
- No undo for hard-delete.

---

## Files (new)
- migration: `add_soft_delete_and_audit_to_crm_contacts.sql`
- migration: `crm_audit_log_table_and_triggers.sql`
- migration: `crm_trash_rpcs_and_can_see_update.sql`
- migration: `crm_exports_bucket.sql`
- insert-tool: `pg_cron crm-purge-trash daily`
- edge fns: `crm-purge-trash/`, `crm-export-lead/`, `crm-export-workspace/`
- frontend: `src/components/crm/leads/TrashSegmentActions.tsx`, `src/pages/admin/AuditLog.tsx`, `src/components/crm/lead/ExportLeadButton.tsx`, `src/components/settings/data/WorkspaceExportCard.tsx`
- hooks: `useSoftDeleteContacts`, `useRestoreContacts`, `useHardDeleteContacts`, `useExportLead`, `useExportWorkspace`, `useAuditLog`
- tests: `src/lib/lead-export-csv.test.ts`, `supabase/functions/_shared/audit_test.ts`

## Files (edited)
- `crm_can_see_contact_id` (migration) — exclude soft-deleted for non-admins.
- `useLeadsList`, `useKanbanLeads`, `useSegmentCounts`, mass-send recipient resolver — add `deleted_at IS NULL` (or rely on RLS).
- `LeadsHeader` segment row — add Trash chip behind admin gate.
- `LeadDetailHeader` — Export + Soft-delete actions in overflow menu.
- `LeadTimelineV2` — new `audit` row renderer (admin-only).
- `mem://index.md` + new memory `mem://features/crm/data-safety-and-audit-v1`.

Approve and I'll ship it in this order: migrations → RPCs/triggers → edge fns → cron → UI → tests → memory.
