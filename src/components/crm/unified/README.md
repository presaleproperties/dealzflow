# Unified Communication Primitives

**Status:** Phase 1 — extraction. Existing dialogs untouched and fully working.

This folder is the single API surface for *all* email + SMS composition and
thread rendering across the CRM. Future phases migrate consumers from the
legacy dialogs to these primitives, then delete the legacy dialogs.

## Exports

| Name | Wraps (today) | Used in Phase |
|---|---|---|
| `<UnifiedComposer />` | `ComposerSurface` | 1 (re-export) |
| `<UnifiedComposerDialog />` | `ComposerSurface` in a `<Dialog>` shell | 2 (replaces `ComposeEmailDialog`) |
| `<UnifiedThreadView />` | `LeadEmailThreadDialog` inline body | 2 (replaces inline modal w/ inline pane) |
| `<UnifiedTemplatePicker />` | `TemplatePicker` | 1 (re-export) |
| `useUnifiedSend()` hook | `useBridgeSendEmail` + `useMassSendEmail` + `useSms` router | 3 |

## Guarantees

- Same RLS, same merge-tag rendering, same signature pipeline, same
  attachment storage path, same template ownership rules.
- Consumers of the legacy components keep working unchanged.
- New code MUST import from `@/components/crm/unified` (lint to be added in
  Phase 4).

## Phase plan

- **Phase 1 (now):** Create barrel + `UnifiedComposer`, `UnifiedTemplatePicker`,
  `UnifiedComposerDialog`. Document.
- **Phase 2:** Migrate `LeadDetail` + `SendProjectDialog` + `PresaleQuickSendDialog`
  to `UnifiedComposerDialog`. Replace `LeadEmailThreadDialog` modal with inline
  `UnifiedThreadView`.
- **Phase 3:** Build `/crm/inbox` shell unifying email + SMS + WhatsApp.
- **Phase 4:** Delete legacy dialogs and add ESLint rule banning their imports.
