/**
 * Canonical entry point for all CRM email + SMS composition and thread
 * primitives. New code MUST import from here. See ./README.md for the
 * Phase 1–4 migration plan.
 */
export { UnifiedComposer, type UnifiedComposerProps } from './UnifiedComposer';
export {
  UnifiedComposerDialog,
  type UnifiedComposerDialogProps,
  type ComposerMode,
} from './UnifiedComposerDialog';
export { UnifiedTemplatePicker } from './UnifiedTemplatePicker';
export { UnifiedEmailThreadDialog } from './UnifiedThreadView';

/* Legacy dialogs surfaced through the unified barrel so consumers can move
 * to a single import path while we keep their bespoke behavior intact.
 * See ./legacy.ts for rationale. */
export {
  LegacyComposeEmailDialog,
  LegacySendProjectDialog,
  LegacySendTextDialog,
  LegacyBulkSendTextDialog,
  LegacyLeadEmailThreadDialog,
  LegacyPresaleQuickSendDialog,
} from './legacy';
