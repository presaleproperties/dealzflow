import { Phone, Mail, MapPin, Languages, Cake, Copy, Check } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useState } from 'react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import type { CrmContact } from '@/hooks/useCrmContacts';

function tryFormatDate(v: string | null): string | null {
  if (!v) return null;
  for (const fmt of ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy']) {
    const d = parse(v, fmt, new Date());
    if (isValid(d)) return format(d, 'MMM d, yyyy');
  }
  return null;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted/50">
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

type Row = {
  icon: any;
  field: string;
  href?: (v: string) => string;
  format?: (v: string) => string | null;
  show?: boolean;
  inputType?: 'text' | 'email';
  selectOptions?: readonly string[];
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
    { icon: MapPin, field: 'city', selectOptions: FRASER_VALLEY_CITIES },
    { icon: Languages, field: 'language', selectOptions: CRM_LANGUAGES },
    { icon: Cake, field: 'birthday', format: (v) => tryFormatDate(v) ?? v, show: !!contact.birthday },
  ];

  const visibleRows = rows.filter(r => r.show === undefined || r.show);

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-1">
      <h3 className="text-sm font-semibold text-foreground mb-3">Contact Info</h3>
      <div className="space-y-1">
        {visibleRows.map((row) => {
          const val = contact[row.field] as string | null;

          if (row.selectOptions) {
            return (
              <div key={row.field} className="group flex items-center gap-2 py-1">
                <Select value={val ?? ''} onValueChange={(v) => save(row.field, v)}>
                  <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-sm shadow-none hover:bg-muted/40 rounded-md px-1.5 w-auto min-w-0 gap-1 text-muted-foreground">
                    <SelectValue placeholder={`Select ${row.field}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {row.selectOptions.map(opt => (
                      <SelectItem key={opt} value={opt} className="text-sm">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }

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
