/**
 * UnifiedThreadView — Phase 1 placeholder.
 *
 * Today, lead-detail email threads render via `<LeadEmailThreadDialog />`
 * (modal) and SMS threads render via `<MessagingCenter />` / `CrmChatThreadPage`.
 * Phase 2 will extract a single inline thread component (Apple-Mail style:
 * collapsed history + inline reply box) used by the lead detail
 * Communication tab and the future `/crm/inbox` shell.
 *
 * For Phase 1 we just expose the existing email-thread dialog under the
 * canonical name so consumers can begin importing from `@/components/crm/unified`.
 */
export { LeadEmailThreadDialog as UnifiedEmailThreadDialog } from '@/components/crm/leads/LeadEmailThreadDialog';
