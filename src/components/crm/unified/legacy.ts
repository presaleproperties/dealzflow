/**
 * Legacy composer/thread re-exports — Phase 2.
 *
 * These dialogs each ship bespoke behavior (project preset, quick-send memory,
 * SMS quiet hours, bulk progress UI) that we deliberately kept intact. They
 * are surfaced through the unified barrel so:
 *
 *   - new code has ONE import path (`@/components/crm/unified`)
 *   - legacy import paths can be lint-banned in Phase 4
 *   - we can swap implementations later without touching consumers
 *
 * @deprecated Direct imports from `@/components/crm/leads/...Dialog` are
 * discouraged. Import the same component from `@/components/crm/unified`
 * instead. New email composition should prefer `<UnifiedComposerDialog />`.
 */

export { ComposeEmailDialog as LegacyComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
export { SendProjectDialog as LegacySendProjectDialog } from '@/components/crm/leads/SendProjectDialog';
export { SendTextDialog as LegacySendTextDialog } from '@/components/crm/leads/SendTextDialog';
export { BulkSendTextDialog as LegacyBulkSendTextDialog } from '@/components/crm/leads/BulkSendTextDialog';
export { LeadEmailThreadDialog as LegacyLeadEmailThreadDialog } from '@/components/crm/leads/LeadEmailThreadDialog';
export { PresaleQuickSendDialog as LegacyPresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
