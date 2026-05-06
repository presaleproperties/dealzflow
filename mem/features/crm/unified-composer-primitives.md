---
name: Unified Composer Primitives (Phase 1)
description: Canonical email/SMS composition primitives in src/components/crm/unified — facades over ComposerSurface, TemplatePicker, LeadEmailThreadDialog. New code must import from here.
type: feature
---
Phase 1 of the email/SMS workflow consolidation. New canonical surface at
`src/components/crm/unified/`:

- `UnifiedComposer` — wraps `ComposerSurface` (0/1/N recipients, mass + single).
- `UnifiedComposerDialog` — `<ResponsiveDialog>` shell + `UnifiedComposer`. In
  Phase 2 it replaces `ComposeEmailDialog`, `SendProjectDialog`, and
  `PresaleQuickSendDialog`.
- `UnifiedTemplatePicker` — re-export of `TemplatePicker`.
- `UnifiedEmailThreadDialog` — re-export of `LeadEmailThreadDialog`. Phase 2
  will replace this modal with an inline Apple-Mail-style thread view.

**Rule:** All new email/SMS composer or thread code MUST import from
`@/components/crm/unified`. Legacy dialogs still work — they get migrated
in Phases 2–4 and then deleted.

See `src/components/crm/unified/README.md` for the full phase plan.
