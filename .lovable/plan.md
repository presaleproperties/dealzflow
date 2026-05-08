# Templates Overhaul — Presale-style Email Builder

Greenlit defaults (from my flagged issues, since you said "build it"):

1. **Bulk sends stay on `crm-mass-send-email`.** `bridge-send-email` is used **only** for "Send test to myself / one address." No bulk through bridge — protects merge tags, suppression, audit logs, agent-of-record.
2. **AI: `template-ai-assist` stays the default.** Bridge AI exposed as a secondary "Ask Presale AI" toggle (only if `BRIDGE_SECRET` returns AI capability).
3. **Editor lives inside `/crm/templates`** as a new full-screen detail mode (replaces the current preview pane when a template is opened with "Edit"). No new route — back button returns to grid. Mobile: stacked single-column with sticky preview FAB.
4. **`BRIDGE_SECRET` is already set** ✅ (also `PRESALE_BRIDGE_SECRET` + `PRESALE_BRIDGE_URL`). No new secret needed.

---

## Scope

### A. Three-pane builder (desktop ≥1280px)

```text
┌───────────┬──────────────────────────┬──────────────┐
│ Inspector │ Editor (subject + body)  │ Live Preview │
│  240px    │  flexible                │  420px       │
└───────────┴──────────────────────────┴──────────────┘
```

- **Inspector (left)**: name, category, scope (Mine / Team — locked unless admin), language, project tags, area tags, merge-tag picker (suggestions only — free typing still allowed), sender identity (locked to caller; admins can override via dropdown).
- **Editor (center)**: subject input + rich HTML body (existing `TemplateEditor` extracted/extended). Toolbar: AI assist menu (improve / shorten / lengthen / tone / translate / generate / subject lines), insert merge tag, insert link, undo/redo.
- **Preview (right)**: rendered with `renderWithSampleData` locally on every keystroke. "Final preview" button hits `bridge-proxy` with `endpoint=render-email` (debounced, manual). Toggle: desktop / mobile preview.

### B. Sender identity (locked)

- Resolved from caller's `crm_team` row → `presale_snapshot` (existing `usePresaleAgentMe`).
- Read-only chip for non-admins. Admins get a `<Select>` listing team members. Selected agent's slug is forwarded as `agent_slug` to test sends and AI prompts.

### C. AI assist

- Default: `template-ai-assist` (existing). Wire all 7 actions via `<AIDiffDialog>` accept/reject (already exists).
- Secondary "Ask Presale AI" button under the AI menu — disabled if `bridge-status` doesn't report AI capability. When enabled, calls `bridge-proxy` with `endpoint=ai-template-assist`.

### D. Test sends

- "Send test" splits to: (1) myself, (2) custom address. Goes through new edge fn `template-send-test` → wraps subject + body in branded HTML + `<AgentSignatureBlock />` + sample merge data → `bridge-proxy endpoint=send-test-email`. Logs to `crm_template_sync_log` (see G).

### E. Autosave

- Local draft autosave every 3s to `localStorage` keyed by template id (or `new:<uuid>` for unsaved).
- Save button = explicit `useUpdateTemplate` / `useCreateTemplate`. On save, if scope is `team:presale` and presale push enabled, also call `push-template-to-presale` (existing).
- Dirty indicator pill in header. `beforeunload` warns on dirty close.

### F. Mobile (≤768px)

- Stacked single-column: Inspector accordion (collapsed), Editor full-width, Preview hidden behind floating FAB → opens preview as bottom-sheet.

### G. Sync log

- New table `crm_template_sync_log` (mirrors `crm_source_events` shape):
  - `id`, `template_id`, `direction` (pull/push/test), `status`, `bridge_endpoint`, `payload_summary`, `error`, `created_at`, `actor_id`.
- RLS: same gating as `crm_email_templates` (own scope visible; admins see all).
- Inspector exposes a "Sync history" tab showing last 10 events for the open template.

---

## Files

### New
- `src/components/crm/templates/builder/TemplateBuilder.tsx` — 3-pane shell
- `src/components/crm/templates/builder/InspectorPane.tsx`
- `src/components/crm/templates/builder/EditorPane.tsx`
- `src/components/crm/templates/builder/PreviewPane.tsx`
- `src/components/crm/templates/builder/SenderIdentityField.tsx`
- `src/components/crm/templates/builder/MergeTagPicker.tsx`
- `src/components/crm/templates/builder/SendTestDialog.tsx`
- `src/components/crm/templates/builder/SyncHistoryList.tsx`
- `src/hooks/useTemplateAutosave.ts`
- `src/hooks/useTemplateSyncLog.ts`
- `supabase/functions/template-send-test/index.ts`

### Edited
- `src/pages/crm/CrmTemplatesPage.tsx` — when a template is selected with "Open", render `<TemplateBuilder />` in place of the preview column (full-bleed)
- `src/components/crm/templates/TemplateEditor.tsx` — extract reusable subject + body editor, used by `EditorPane`
- `mem://index.md` + new `mem://features/crm/templates-builder-v2.md`

### Migration
- Create `crm_template_sync_log` table + RLS + index on (template_id, created_at desc).

---

## Out of scope (intentionally)

- Replacing `crm-mass-send-email` — bulk sends stay on existing pipeline.
- New `/crm/templates/builder/:slug` route — handled in-place.
- Removing `merge_tags` array — kept as picker source, not a closed list.
- Bridge `bridge-save-template` autosave — local autosave only; explicit save pushes to bridge if team scope.

---

## Validation

- Open existing template → 3-pane renders, AI assist menu opens, preview updates on keystroke.
- Edit subject/body → autosave indicator flips dirty → save persists → no second composer appears.
- Send test to myself → email arrives with branded template + signature.
- Non-admin opens team template → Sender chip locked to their identity.
- Mobile ≤768px → single column, preview FAB opens sheet.
- Sync history tab shows test-send + push events.
