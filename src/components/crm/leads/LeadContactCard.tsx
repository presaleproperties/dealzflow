import { Phone, Mail, Globe, Calendar, UserCheck, Cake, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { CrmContact } from '@/hooks/useCrmContacts';

const CONTACT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  lead: { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)', label: 'Lead' },
  realtor: { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)', label: 'Realtor' },
  past_client: { bg: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)', label: 'Client' },
};

export function LeadContactCard({ contact }: { contact: CrmContact }) {
  const typeStyle = CONTACT_TYPE_STYLES[contact.contact_type] ?? CONTACT_TYPE_STYLES.lead;

  const rows = [
    { icon: Hash, label: 'Type', value: typeStyle.label, badge: true, badgeBg: typeStyle.bg, badgeColor: typeStyle.color },
    { icon: Phone, label: 'Phone', value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined },
    { icon: Mail, label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
    ...(contact.email_secondary ? [{ icon: Mail, label: 'Alt Email', value: contact.email_secondary, href: `mailto:${contact.email_secondary}` }] : []),
    { icon: Globe, label: 'Source', value: contact.source },
    { icon: Calendar, label: 'Added', value: format(new Date(contact.created_at), 'MMM d, yyyy') },
    { icon: UserCheck, label: 'Assigned', value: contact.assigned_to },
    ...(contact.birthday ? [{ icon: Cake, label: 'Birthday', value: contact.birthday }] : []),
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Contact Info</h3>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <row.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{row.label}</span>
            {'badge' in row && row.badge ? (
              <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: row.badgeBg, color: row.badgeColor }}>
                {row.value}
              </Badge>
            ) : row.href ? (
              <a href={row.href} className="text-sm text-primary hover:underline truncate">{row.value}</a>
            ) : (
              <span className="text-sm text-foreground truncate">{row.value ?? '—'}</span>
            )}
          </div>
        ))}
      </div>

      {/* Projects */}
      {((contact.projects ?? []).length > 0 || contact.project) && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1.5">Projects</p>
          <div className="flex flex-wrap gap-1">
            {((contact.projects ?? []).length > 0 ? contact.projects! : [contact.project!]).map(p => (
              <Badge key={p} variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Co-buyer info */}
      {contact.co_buyer_name && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Co-Buyer</p>
          <p className="text-sm text-foreground">{contact.co_buyer_name}</p>
          {contact.co_buyer_phone && <p className="text-xs text-muted-foreground">{contact.co_buyer_phone}</p>}
          {contact.co_buyer_email && <p className="text-xs text-muted-foreground">{contact.co_buyer_email}</p>}
          {contact.co_buyer_birthday && <p className="text-xs text-muted-foreground">Birthday: {contact.co_buyer_birthday}</p>}
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
