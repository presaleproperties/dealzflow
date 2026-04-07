import { Phone, Mail, Globe, Calendar, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function LeadContactCard({ contact }: { contact: CrmContact }) {
  const rows = [
    { icon: Phone, label: 'Phone', value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined },
    { icon: Mail, label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
    { icon: Globe, label: 'Source', value: contact.source },
    { icon: Calendar, label: 'Added', value: format(new Date(contact.created_at), 'MMM d, yyyy') },
    { icon: UserCheck, label: 'Assigned', value: contact.assigned_to },
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Contact Info</h3>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <row.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{row.label}</span>
            {row.href ? (
              <a href={row.href} className="text-sm text-primary hover:underline truncate">{row.value}</a>
            ) : (
              <span className="text-sm text-foreground truncate">{row.value ?? '—'}</span>
            )}
          </div>
        ))}
      </div>

      {/* Co-buyer info */}
      {contact.co_buyer_name && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Co-Buyer</p>
          <p className="text-sm text-foreground">{contact.co_buyer_name}</p>
          {contact.co_buyer_phone && <p className="text-xs text-muted-foreground">{contact.co_buyer_phone}</p>}
          {contact.co_buyer_email && <p className="text-xs text-muted-foreground">{contact.co_buyer_email}</p>}
        </div>
      )}

      {/* Budget / preferences */}
      {(contact.budget_min || contact.budget_max || contact.bedrooms_preferred || contact.language) && (
        <div className="pt-2 border-t border-border space-y-1">
          {(contact.budget_min || contact.budget_max) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Budget:</span>
              <span className="text-sm text-foreground">
                {contact.budget_min ? `$${Number(contact.budget_min).toLocaleString()}` : '?'} – {contact.budget_max ? `$${Number(contact.budget_max).toLocaleString()}` : '?'}
              </span>
            </div>
          )}
          {contact.bedrooms_preferred && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Bedrooms:</span>
              <span className="text-sm text-foreground">{contact.bedrooms_preferred}</span>
            </div>
          )}
          {contact.language && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Language:</span>
              <span className="text-sm text-foreground">{contact.language}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
