import { Phone, Mail, MapPin, Languages, Cake } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import type { CrmContact } from '@/hooks/useCrmContacts';

function tryFormatDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Try ISO, then common formats
  for (const fmt of ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'MMMM d, yyyy']) {
    try {
      const d = parse(raw, fmt, new Date());
      if (isValid(d)) return format(d, 'MMMM d, yyyy');
    } catch {}
  }
  // Fallback: try native Date
  const d = new Date(raw);
  if (isValid(d) && !isNaN(d.getTime())) return format(d, 'MMMM d, yyyy');
  return raw; // Return as-is if we can't parse
}

type Row = {
  icon: React.ComponentType<any>;
  label: string;
  field: keyof CrmContact;
  href?: (v: string) => string;
  format?: (v: string) => string;
  show?: boolean;
};

export function LeadContactCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();

  const save = (field: string, value: string) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value || null } });
  };

  const rows: Row[] = [
    { icon: Phone, label: 'Phone', field: 'phone', href: (v) => `tel:${v}` },
    { icon: Phone, label: 'Phone 2', field: 'phone_secondary', href: (v) => `tel:${v}`, show: !!contact.phone_secondary },
    { icon: Mail, label: 'Email', field: 'email', href: (v) => `mailto:${v}` },
    { icon: Mail, label: 'Email 2', field: 'email_secondary', href: (v) => `mailto:${v}`, show: !!contact.email_secondary },
    { icon: MapPin, label: 'City', field: 'city' },
    { icon: Languages, label: 'Language', field: 'language' },
    { icon: Cake, label: 'Birthday', field: 'birthday', format: (v) => tryFormatDate(v) ?? v, show: !!contact.birthday },
  ];

  // Always show phone, email, city, language. Show optional ones only if they have data
  const visibleRows = rows.filter(r => r.show === undefined || r.show);

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Contact Info</h3>
      <div className="space-y-2.5">
        {visibleRows.map((row) => {
          const val = contact[row.field] as string | null;
          const displayVal = val && row.format ? row.format(val) : val;
          return (
            <div key={row.label} className="flex items-center gap-3">
              <row.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
              <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{row.label}</span>
              <InlineEditField
                value={displayVal}
                onSave={(v) => save(row.field, v)}
                href={val && row.href ? row.href(val) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
