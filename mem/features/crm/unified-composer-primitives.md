---
name: Unified Inbox & Composer Primitives (Phases 1–4)
description: Canonical email/SMS/WhatsApp surfaces. /crm/inbox tabbed shell + @/components/crm/unified barrel (Unified* + Legacy* re-exports). ESLint bans direct legacy paths.
type: feature
---
**Single source of truth for all CRM communication UI.**

### Routes
- `/crm/inbox` — Apple-Mail-style hub (Email · SMS · WhatsApp). Each tab
  mounts the existing surface unmodified (`CrmEmailWorkspacePage`,
  `CrmSmsCenterPage` (admin-only), `CrmChatsShell`). Active tab persists in
  `localStorage['crm:inbox:active-channel']` and `?channel=` query.
- `/crm/email`, `/crm/sms`, `/crm/chats` remain reachable for deep links.

### Canonical import path
All composer / thread / template-picker code MUST import from
`@/components/crm/unified`:

| Symbol | Today wraps | Use for |
|---|---|---|
| `UnifiedComposer` | `ComposerSurface` | Inline composer |
| `UnifiedComposerDialog` | `ComposerSurface` in `<ResponsiveDialog>` | New modal composer |
| `UnifiedTemplatePicker` | `TemplatePicker` | Picking templates |
| `UnifiedEmailThreadDialog` | `LeadEmailThreadDialog` | Thread modal |
| `LegacyComposeEmailDialog` | `ComposeEmailDialog` | Existing single-lead compose |
| `LegacySendProjectDialog` | `SendProjectDialog` | Project preset send |
| `LegacySendTextDialog` | `SendTextDialog` | Single SMS / WhatsApp send |
| `LegacyBulkSendTextDialog` | `BulkSendTextDialog` | Bulk SMS / WhatsApp |
| `LegacyLeadEmailThreadDialog` | `LeadEmailThreadDialog` | Inline thread modal |
| `LegacyPresaleQuickSendDialog` | `PresaleQuickSendDialog` | Bridge template quick-send |

### Enforcement
ESLint `no-restricted-imports` rule (in `eslint.config.js`) bans direct
imports of the six legacy paths anywhere except inside
`src/components/crm/unified/**` itself.

### Phase log
- **Phase 1** — extracted Unified primitives as facades (no behavior change).
- **Phase 2** — surfaced legacy dialogs via `unified/legacy.ts` re-exports.
- **Phase 3** — built `/crm/inbox` tabbed shell + Sidebar nav entry.
- **Phase 4** — ESLint guard wired; this memory doc updated.

Future replacements (e.g. unifying SendProjectDialog into
UnifiedComposerDialog) only need to swap the implementation behind the
unified barrel — no consumer changes required.
