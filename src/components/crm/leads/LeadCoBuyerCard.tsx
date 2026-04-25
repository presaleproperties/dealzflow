import { User, Phone, Mail, Cake } from 'lucide-react';
import { useState } from 'react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function LeadCoBuyerCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [showCompose, setShowCompose] = useState(false);
  const has = contact.co_buyer_name || contact.co_buyer_phone || contact.co_buyer_email || contact.co_buyer_birthday;
  if (!has) return null;

  const save = (field: string, value: string) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value || null } });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Co-Buyer</h3>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Name</span>
          <InlineEditField value={contact.co_buyer_name} onSave={(v) => save('co_buyer_name', v)} />
        </div>
        {contact.co_buyer_phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Phone</span>
            <InlineEditField value={contact.co_buyer_phone} onSave={(v) => save('co_buyer_phone', v)} href={`tel:${contact.co_buyer_phone}`} />
          </div>
        )}
        {contact.co_buyer_email && (
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Email</span>
            <InlineEditField
              value={contact.co_buyer_email}
              onSave={(v) => save('co_buyer_email', v)}
              href={`mailto:${contact.co_buyer_email}`}
              onActivate={() => setShowCompose(true)}
            />
          </div>
        )}
        {contact.co_buyer_birthday && (
          <div className="flex items-center gap-3">
            <Cake className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Birthday</span>
            <InlineEditField value={contact.co_buyer_birthday} onSave={(v) => save('co_buyer_birthday', v)} />
          </div>
        )}
      </div>
      <ComposeEmailDialog contact={contact} open={showCompose} onOpenChange={setShowCompose} />
    </div>
  );
}
