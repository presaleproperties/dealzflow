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
