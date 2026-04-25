import { Hash, Target, DollarSign, Building2, Fingerprint, BedDouble, MapPin, Home, Megaphone, Users, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { InlineEditField } from './InlineEditField';
import { SourcePicker } from './SourcePicker';
import { formatCurrency } from '@/lib/format';
import { LEAD_TYPE_LABELS, type CrmContact } from '@/hooks/useCrmContacts';

const TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  lead: { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)', label: 'Lead' },
  realtor: { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)', label: 'Realtor' },
  past_client: { bg: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)', label: 'Client' },
};

export function LeadDetailsCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const typeStyle = TYPE_STYLES[contact.contact_type] ?? TYPE_STYLES.lead;

  const save = (field: string, value: string | number | null) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value } });
  };

  const hasBudget = contact.budget_min != null || contact.budget_max != null;
  const projects = (contact.projects?.length ? contact.projects : contact.project ? [contact.project] : []);

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Lead Details</h3>
      <div className="space-y-2.5">
        {/* Contact Type */}
        <div className="flex items-center gap-3">
          <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Type</span>
          <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: typeStyle.bg, color: typeStyle.color }}>
            {typeStyle.label}
          </Badge>
        </div>

        {/* Lead Type(s) */}
        {(() => {
          const types: string[] = ((contact as any).lead_types as string[] | undefined)?.length
            ? ((contact as any).lead_types as string[])
            : contact.lead_type ? [contact.lead_type] : [];
          if (types.length === 0) return null;
          return (
            <div className="flex items-center gap-3 flex-wrap">
              <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
              <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Lead Type</span>
              <div className="flex flex-wrap gap-1">
                {types.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="border-0 text-[10px] font-semibold"
                    style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                  >
                    {LEAD_TYPE_LABELS[t] ?? t}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Budget */}
        {hasBudget && (
          <div className="flex items-center gap-3">
            <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Budget</span>
            <span className="text-sm text-foreground">
              {contact.budget_min ? formatCurrency(Number(contact.budget_min)) : '?'} – {contact.budget_max ? formatCurrency(Number(contact.budget_max)) : '?'}
            </span>
          </div>
        )}

        {/* Bedrooms */}
        {contact.bedrooms_preferred && (
          <div className="flex items-center gap-3">
            <BedDouble className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Beds</span>
            <InlineEditField value={contact.bedrooms_preferred} onSave={(v) => save('bedrooms_preferred', v || null)} />
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div className="flex items-start gap-3">
            <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0 mt-0.5">Projects</span>
            <div className="flex flex-wrap gap-1">
              {projects.map(p => (
                <Badge key={p} variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Source */}
        <div className="flex items-center gap-3">
          <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Source</span>
          <InlineEditField value={contact.source} onSave={(v) => save('source', v || null)} />
        </div>

        {/* Lofty ID */}
        {contact.lofty_id && (
          <div className="flex items-center gap-3">
            <Fingerprint className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Lofty ID</span>
            <span className="text-[11px] text-muted-foreground font-mono truncate">{contact.lofty_id}</span>
          </div>
        )}

        {/* Pre-Approved */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Approved</span>
          {(contact as any).is_pre_approved ? (
            <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)' }}>Pre-Approved</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Not Pre-Approved</span>
          )}
        </div>

        {/* Property Type Preference */}
        {(contact as any).property_type_pref && (
          <div className="flex items-center gap-3">
            <Home className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Prop Type</span>
            <Badge variant="outline" className="border-0 text-[10px] font-semibold capitalize bg-muted/60 text-foreground">{(contact as any).property_type_pref}</Badge>
          </div>
        )}

        {/* Preferred City */}
        {(contact as any).city_pref && (
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">City</span>
            <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' }}>{(contact as any).city_pref}</Badge>
          </div>
        )}

        {/* Campaign Source */}
        {(contact as any).campaign_source && (
          <div className="flex items-center gap-3">
            <Megaphone className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Campaign</span>
            <span className="text-sm text-foreground truncate">{(contact as any).campaign_source}</span>
          </div>
        )}

        {/* Referral Source */}
        {(contact as any).referral_source && (
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.8} />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Referral</span>
            <span className="text-sm text-foreground truncate">{(contact as any).referral_source}</span>
          </div>
        )}
      </div>
    </div>
  );
}
