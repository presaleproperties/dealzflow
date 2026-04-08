import { Phone, Mail, MapPin, Languages, Cake, Copy, Check } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useState } from 'react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import type { CrmContact } from '@/hooks/useCrmContacts';

function tryFormatDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const fmt of ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'MMMM d, yyyy']) {
    try {
      const d = parse(raw, fmt, new Date());
      if (isValid(d)) return format(d, 'MMMM d, yyyy');
    } catch {}
  }
  const d = new Date(raw);
  if (isValid(d) && !isNaN(d.getTime())) return format(d, 'MMMM d, yyyy');
  return raw;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handle} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground ml-1.5">
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

type Row = {
  icon: React.ComponentType<any>;
  field: keyof CrmContact;
  href?: (v: string) => string;
  format?: (v: string) => string;
  show?: boolean;
  inputType?: 'text' | 'email';
};

export function LeadContactCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();

  const save = (field: string, value: string) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value || null } });
  };

  const rows: Row[] = [
    { icon: Mail, field: 'email', href: (v) => `mailto:${v}`, inputType: 'email' },
    { icon: Mail, field: 'email_secondary', href: (v) => `mailto:${v}`, show: !!contact.email_secondary, inputType: 'email' },
    { icon: Phone, field: 'phone', href: (v) => `tel:${v}` },
    { icon: Phone, field: 'phone_secondary', href: (v) => `tel:${v}`, show: !!contact.phone_secondary },
    { icon: MapPin, field: 'city' },
    { icon: Languages, field: 'language' },
    { icon: Cake, field: 'birthday', format: (v) => tryFormatDate(v) ?? v, show: !!contact.birthday },
  ];

  const visibleRows = rows.filter(r => r.show === undefined || r.show);

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-1">
      <h3 className="text-sm font-semibold text-foreground mb-3">Contact Info</h3>
      <div className="space-y-1">
        {visibleRows.map((row) => {
          const val = contact[row.field] as string | null;
          const displayVal = val && row.format ? row.format(val) : val;
          return (
            <div key={row.field} className="group flex items-center gap-2 py-1">
              <InlineEditField
                value={displayVal}
                onSave={(v) => save(row.field, v)}
                href={val && row.href ? row.href(val) : undefined}
                type={row.inputType}
                className="text-sm"
              />
              {val && <CopyButton value={val} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
