/**
 * UnifiedComposer — Phase 1 facade over `ComposerSurface`.
 *
 * The internal implementation is unchanged. This file establishes the
 * canonical import path (`@/components/crm/unified`) so future phases can
 * swap the implementation without touching consumers.
 *
 * Phase 2 will migrate LeadDetail, SendProjectDialog, PresaleQuickSendDialog
 * and the bulk surfaces to this component.
 */
import { ComposerSurface, type ComposerSurfaceProps } from '@/components/crm/email/ComposerSurface';

export type UnifiedComposerProps = ComposerSurfaceProps;

export function UnifiedComposer(props: UnifiedComposerProps) {
  return <ComposerSurface {...props} />;
}
