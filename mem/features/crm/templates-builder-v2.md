---
name: Templates Builder v2
description: Enhanced TemplateEditor with sender lock, send-test via bridge, sync history, autosave; full-screen dialog
type: feature
---

`src/components/crm/templates/TemplateEditor.tsx` was extended (NOT replaced) with:

- `<SenderIdentityField />` — read-only chip at top of inspector. Sender always = caller's identity (Sender Signature Rule). No admin override exposed; admins still can't spoof another agent.
- `<SendTestDialog />` — toolbar button + full-preview button both open it. Calls `template-send-test` edge fn → wraps caller's `crm_team.email` (or auth email) → forwards to `bridge-send-email` (gets agent Gmail/info@ identity routing for free) → logs row to `crm_template_sync_log` with direction=`test`.
- `<SyncHistoryList />` — collapsible at bottom of inspector. Reads `crm_template_sync_log` via `useTemplateSyncLog` hook. Shows last 10 events (pull/push/test) with status, timestamp, target, error.
- `useTemplateAutosave(key, snapshot)` — localStorage rescue copy every 3s under `crm_template_draft:<id|new-template>`. Cleared on explicit Save. `dirty` flag drives Saved/Unsaved pill in header + `beforeunload` warning.

Editor dialog in `CrmTemplatesPage` is now full-screen (98vw x 96vh) instead of 6xl.

Edge fn `template-send-test`:
- Validates JWT, resolves caller email, forwards to `bridge-send-email` (subject prefixed `[TEST]`, no contact_id so it doesn't pollute the lead inbox).
- Always logs to `crm_template_sync_log` regardless of success.

Migration: `crm_template_sync_log` table — RLS allows read for owner/admin or template owner (via `crm_my_presale_slug()` or team scope); writes are service-role only.

Bulk sends remain on `crm-mass-send-email`. Bridge is only used for test sends.
