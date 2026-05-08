/**
 * UnifiedComposerDialog — Phase 1 dialog shell wrapping `<UnifiedComposer />`.
 *
 * In Phase 2, `ComposeEmailDialog`, `SendProjectDialog`, and
 * `PresaleQuickSendDialog` will be deleted in favour of mounting this dialog
 * with the appropriate `initial*` props + recipients.
 *
 * For Phase 1 this component is unused; it exists so that the surface area
 * is established and importable, and so that follow-up PRs can land in
 * small, reviewable chunks.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from '@/components/ui/responsive-dialog';
import { UnifiedComposer } from './UnifiedComposer';
import type { CrmContact } from '@/hooks/useCrmContacts';

export type ComposerMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'bulk';

export interface UnifiedComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single recipient — used for `new`/`reply`/`replyAll`/`forward`. */
  contact?: CrmContact;
  /** Bulk recipients — used for `bulk`. */
  contacts?: CrmContact[];
  mode?: ComposerMode;
  initialSubject?: string;
  initialBodyHtml?: string;
  initialCc?: string;
  /** Fires after a successful send. */
  onSent?: () => void;
}

export function UnifiedComposerDialog({
  open,
  onOpenChange,
  contact,
  contacts,
  mode: _mode = 'new',
  initialSubject: _initialSubject,
  initialBodyHtml: _initialBodyHtml,
  initialCc: _initialCc,
  onSent,
}: UnifiedComposerDialogProps) {
  // Recipients are owned locally so the chip remove-x works.
  const seed = useMemo<CrmContact[]>(() => {
    if (contacts && contacts.length) return contacts;
    if (contact) return [contact];
    return [];
  }, [contact, contacts]);

  const [recipients, setRecipients] = useState<CrmContact[]>(seed);
  useEffect(() => { if (open) setRecipients(seed); }, [open, seed]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        hideMobileHandle
        className="mobile-fullbleed max-w-4xl w-[min(960px,95vw)] h-[min(85vh,900px)] p-0 overflow-hidden flex flex-col"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <UnifiedComposer
            recipients={recipients}
            onAddRecipient={(c) =>
              setRecipients((prev) => (prev.find((p) => p.id === c.id) ? prev : [...prev, c]))
            }
            onRemoveRecipient={(id) =>
              setRecipients((prev) => prev.filter((p) => p.id !== id))
            }
            onClearRecipients={() => setRecipients([])}
            onSent={() => {
              onSent?.();
              onOpenChange(false);
            }}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
