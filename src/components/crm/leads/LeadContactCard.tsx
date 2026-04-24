import { Phone, Mail, MapPin, Languages, Cake, Copy, Check } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useState } from 'react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import { CheckboxDropdown } from './CheckboxDropdown';
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
  multiSelect?: { options: readonly string[]; allowCustom?: boolean };
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
    { icon: MapPin, field: 'city', multiSelect: { options: FRASER_VALLEY_CITIES, allowCustom: true } },
    { icon: Languages, field: 'language', multiSelect: { options: CRM_LANGUAGES, allowCustom: true } },
    { icon: Cake, field: 'birthday', format: (v) => tryFormatDate(v) ?? v, show: !!contact.birthday },
  ];

  const visibleRows = rows.filter(r => r.show === undefined || r.show);

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-1">
      <h3 className="text-sm font-semibold text-foreground mb-3">Contact Info</h3>
      <div className="space-y-1">
        {visibleRows.map((row) => {
          const val = contact[row.field] as string | null;

          if (row.multiSelect) {
            // Parse stored multi-value string into individual cities/languages.
            // Use the pipe / newline / semicolon separator only — splitting on commas
            // would break canonical entries like "Langley, BC" or "Surrey, BC" into
            // two ghost values ("Langley" + "BC"), which caused the duplicate
            // "Surrey" entries seen in the dropdown.
            const rawParts = val
              ? val.split(/[|;\n\r]+/).map(s => s.trim()).filter(Boolean)
              : [];
            // Normalize: strip trailing ", BC" / "British Columbia" province suffixes
            // (legacy import data) and de-duplicate case-insensitively, preferring
            // the canonical option spelling whenever it exists.
            const canonicalByLower = new Map<string, string>(
              row.multiSelect.options.map(o => [o.toLowerCase(), o]),
            );
            const seen = new Map<string, string>();
            for (const part of rawParts) {
              const cleaned = part
                .replace(/,\s*(bc|british columbia|b\.c\.?)\s*$/i, '')
                .replace(/,+\s*$/, '')
                .trim();
              if (!cleaned) continue;
              const key = cleaned.toLowerCase();
              if (seen.has(key)) continue;
              seen.set(key, canonicalByLower.get(key) ?? cleaned);
            }
            const selected = Array.from(seen.values());
            const Icon = row.icon;
            return (
              <div key={row.field} className="group flex items-start gap-2 py-1">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-3" strokeWidth={1.8} />
                <CheckboxDropdown
                  options={row.multiSelect.options}
                  selected={selected}
                  onChange={(v) => save(row.field, v.join(' | '))}
                  placeholder={row.field === 'city' ? 'Select or add city' : `Select ${row.field}`}
                  allowCustom={row.multiSelect.allowCustom}
                  className="flex-1"
                />
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
