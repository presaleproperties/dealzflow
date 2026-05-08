// NewEmailLauncherDialog
// ---------------------------------------------------------------------------
// "New Email" entry point for surfaces without a preselected recipient
// (currently /crm/email). Per user request: no two-step "Who are you
// emailing?" picker — open the canonical <ComposeEmailDialog /> immediately
// with an empty recipient. The composer's To row renders an inline
// autocomplete picker so the agent picks the lead from inside the composer.
import { useState } from 'react';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_CONTACT: CrmContact = {
  id: '__pick__',
  first_name: '',
  last_name: '',
  email: null,
} as unknown as CrmContact;

export function NewEmailLauncherDialog({ open, onOpenChange }: Props) {
  const [picked, setPicked] = useState<CrmContact | null>(null);
  if (!open) return null;

  const active = picked ?? EMPTY_CONTACT;

  return (
    <ComposeEmailDialog
      contact={active}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPicked(null);
          onOpenChange(false);
        }
      }}
      onPickContact={(c) => setPicked(c)}
    />
  );
}
