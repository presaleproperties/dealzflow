import { useState } from 'react';
import { Phone, Mail, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatContactName, formatCurrency, formatPhone } from '@/lib/format';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { LEAD_STATUSES, AGENTS, LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { InlineLibraryPicker } from '@/components/crm/leads/InlineLibraryPicker';
import { SourcePicker } from '@/components/crm/leads/SourcePicker';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadScore } from './types';
import { SectionHeader, InsightCard, DetailRow } from './shared';

interface Props {
  contact: CrmContact;
  leadScore: LeadScore;
  lastTouchLabel: string;
  daysInPipeline: number;
  onCall?: () => void;
  onSms?: () => void;
  onEmail?: () => void;
}

export function LeftSidebar({
  contact, leadScore, lastTouchLabel, daysInPipeline, onCall, onSms, onEmail,
}: Props) {
  const updateContact = useUpdateCrmContact();
  const [coBuyerOpen, setCoBuyerOpen] = useState(true);

  const { data: tagLib = [] } = useCrmTags();
  const { data: projectLib = [] } = useCrmProjects();
  const { data: leadTypeLib = [] } = useCrmLeadTypes();
  const createTag = useCreateCrmTag();
  const createProject = useCreateCrmProject();
  const createLeadType = useCreateCrmLeadType();

  const tags = (contact.tags ?? []) as string[];
  const projects = contact.projects?.length
    ? contact.projects
    : contact.project ? [contact.project] : [];
  const hasCoBuyer = !!(contact.co_buyer_name || contact.co_buyer_phone || contact.co_buyer_email);

  const save = (field: string, value: unknown) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value } });
  };
  const saveWithLog = (field: string, value: unknown) => {
    updateContact.mutate({
      id: contact.id,
      updates: { [field]: value, ...(field === 'status' ? { status_changed_at: new Date().toISOString() } : {}) },
      oldValues: { [field]: (contact as unknown as Record<string, unknown>)[field] },
    });
  };

  const showActionRow = !!(onCall || onSms || onEmail);
  const contactExt = contact as unknown as Record<string, unknown>;
  const leadTypesArr = (contactExt.lead_types as string[] | undefined) ?? [];
  const syncSource = contactExt.sync_source as string | undefined;
  const loftyId = contactExt.lofty_id as string | undefined;
  const loftySyncedAt = contactExt.lofty_synced_at as string | undefined;

  return (
    <div className="space-y-6">
      {/* Identity card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground leading-[1.15] tracking-tight break-words">
            {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
          </h2>
          {contact.source && (
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mt-1.5 truncate">
              {contact.source}
            </p>
          )}
          {(() => {
            const types = (leadTypesArr.length ? leadTypesArr : contact.lead_type ? [contact.lead_type] : []).slice(0, 3);
            if (types.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {types.map((t) => (
                  <span key={t} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded-md px-2 py-1">
                    {LEAD_TYPE_LABELS[t] || t}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
        <div className="space-y-1.5 pt-3 border-t border-border/60">
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/\D/g, '')}`} className="flex items-center gap-2.5 text-sm font-medium text-foreground hover:text-primary transition-colors group">
              <Phone className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <span className="truncate">{formatPhone(contact.phone)}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
              <Phone className="w-3.5 h-3.5 shrink-0" /> <span>No phone</span>
            </div>
          )}
          {contact.email ? (
            <button
              type="button"
              onClick={onEmail}
              disabled={!onEmail}
              className="flex items-center gap-2.5 text-sm font-medium text-foreground hover:text-primary transition-colors group text-left w-full disabled:cursor-default"
            >
              <Mail className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <span className="truncate">{contact.email}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
              <Mail className="w-3.5 h-3.5 shrink-0" /> <span>No email</span>
            </div>
          )}
        </div>
      </div>

      {showActionRow && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onCall}
            disabled={!contact.phone}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-emerald-500/5 border border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Call"
          >
            <Phone className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 group-hover:text-emerald-700">Call</span>
          </button>
          <button
            onClick={onSms}
            disabled={!contact.phone}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-sky-500/5 border border-sky-500/30 hover:border-sky-500/60 hover:bg-sky-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Text"
          >
            <Send className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-600/80 group-hover:text-sky-600">Text</span>
          </button>
          <button
            onClick={onEmail}
            disabled={!contact.email}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-blue-700/5 border border-blue-700/30 hover:border-blue-700/60 hover:bg-blue-700/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Email"
          >
            <Mail className="w-4 h-4 text-blue-700 group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700/80 group-hover:text-blue-700">Email</span>
          </button>
        </div>
      )}

      {/* Pipeline Stage */}
      <div className="space-y-2">
        <SectionHeader>Pipeline Stage</SectionHeader>
        <Select value={contact.status ?? 'New Lead'} onValueChange={(v) => saveWithLog('status', v)}>
          <SelectTrigger className="h-9 text-sm bg-card border-border font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Insight */}
      <div className="space-y-2.5">
        <SectionHeader>Insight</SectionHeader>
        <div className="grid grid-cols-3 gap-1.5">
          <InsightCard
            value={<span style={{ color: leadScore.color }}>{leadScore.score}</span>}
            label="Score"
            sublabel={leadScore.label.toUpperCase()}
            accent={leadScore.color}
          />
          <InsightCard value={lastTouchLabel} label="Last Activity" />
          <InsightCard value={`${daysInPipeline}d`} label="In Pipeline" />
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3">
        <SectionHeader>Details</SectionHeader>
        <div className="space-y-px">
          <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 group">
            <span className="text-xs text-muted-foreground shrink-0">Source</span>
            <div className="flex-1 min-w-0 flex justify-end">
              <SourcePicker value={contact.source} onChange={(v) => save('source', v)} />
            </div>
          </div>
          {contact.email_secondary && <DetailRow label="Email 2" value={contact.email_secondary} field="email_secondary" contactId={contact.id} type="email" />}
          <DetailRow label="City" value={contact.city} field="city" contactId={contact.id} type="select" options={FRASER_VALLEY_CITIES} />
          <DetailRow label="Language" value={contact.language} field="language" contactId={contact.id} type="select" options={CRM_LANGUAGES} />

          {contact.bedrooms_preferred && <DetailRow label="Beds" value={contact.bedrooms_preferred} field="bedrooms_preferred" contactId={contact.id} />}

          {(contact.budget_min != null || contact.budget_max != null) && (
            <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
              <span className="text-xs text-muted-foreground">Budget</span>
              <span className="text-[13px] text-foreground font-medium tabular-nums">
                {contact.budget_min ? formatCurrency(Number(contact.budget_min)) : '—'} – {contact.budget_max ? formatCurrency(Number(contact.budget_max)) : '—'}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
            <span className="text-xs text-muted-foreground">Registered</span>
            <span className="text-[13px] text-foreground tabular-nums">{format(new Date(contact.created_at), 'MMM d, yyyy')}</span>
          </div>

          {(syncSource === 'zapier_lofty' || syncSource === 'lofty_api_sync') && (
            <>
              {loftyId && (
                <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">Lofty ID</span>
                  <span className="text-[11px] font-mono text-muted-foreground/80 truncate max-w-[140px]">{loftyId}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-xs text-muted-foreground">Synced</span>
                <span className="text-[11px] text-muted-foreground/80">
                  {loftySyncedAt ? format(new Date(loftySyncedAt), 'MMM d, h:mm a') : 'via Lofty'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lead Type */}
      <div className="space-y-2">
        <SectionHeader>Lead Type</SectionHeader>
        {(() => {
          const selected: string[] = leadTypesArr.length ? leadTypesArr : contact.lead_type ? [contact.lead_type] : [];
          const libMap = new Map<string, { label: string; count: number }>();
          leadTypeLib.forEach(l => libMap.set(l.name.toLowerCase(), { label: l.name, count: l.usage_count }));
          LEAD_TYPES.forEach(t => {
            if (!libMap.has(t.toLowerCase())) libMap.set(t.toLowerCase(), { label: t, count: 0 });
          });
          const merged = Array.from(libMap.values()).sort((a, b) => b.count - a.count);
          return (
            <InlineLibraryPicker
              selected={selected}
              library={merged}
              onChange={(next) => {
                updateContact.mutate({
                  id: contact.id,
                  updates: { lead_types: next, lead_type: next[0] ?? null },
                  oldValues: { lead_types: selected, lead_type: contact.lead_type },
                });
              }}
              onCreate={(name) => createLeadType.mutate(name)}
              renderLabel={(v) => LEAD_TYPE_LABELS[v] ?? v}
              variant="primary"
              placeholder="Search or add lead type…"
              emptyText="No lead types yet"
            />
          );
        })()}
      </div>

      {/* Tags */}
      <div className="space-y-2.5">
        <SectionHeader>Tags</SectionHeader>
        <InlineLibraryPicker
          selected={tags}
          library={tagLib.map(t => ({ label: t.name, count: t.usage_count }))}
          onChange={(next) => save('tags', next)}
          onCreate={(name) => createTag.mutate(name)}
          placeholder="Search or add tag…"
          emptyText="No tags yet"
        />
      </div>

      {/* Projects */}
      <div className="space-y-2.5">
        <SectionHeader>Projects</SectionHeader>
        <InlineLibraryPicker
          selected={projects}
          library={projectLib.map(p => ({ label: p.name, count: p.usage_count }))}
          onChange={(next) => {
            updateContact.mutate({
              id: contact.id,
              updates: { projects: next, project: next[0] ?? null },
              oldValues: { projects: contact.projects ?? [], project: contact.project },
            });
          }}
          onCreate={(name) => createProject.mutate(name)}
          placeholder="Search or add project…"
          emptyText="No projects yet"
        />
      </div>

      {/* Co-Buyer */}
      <div className="space-y-2.5">
        <button onClick={() => setCoBuyerOpen(!coBuyerOpen)} className="flex items-center justify-between w-full">
          <SectionHeader>{hasCoBuyer ? 'Co-Buyer' : 'Family Member'}</SectionHeader>
          {coBuyerOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {coBuyerOpen && (
          <div className="space-y-px">
            {hasCoBuyer ? (
              <>
                <DetailRow label="Name" value={contact.co_buyer_name} field="co_buyer_name" contactId={contact.id} />
                <DetailRow label="Phone" value={contact.co_buyer_phone} field="co_buyer_phone" contactId={contact.id} displayFormatter={formatPhone} />
                <DetailRow label="Email" value={contact.co_buyer_email} field="co_buyer_email" contactId={contact.id} type="email" />
              </>
            ) : (
              <p className="text-xs text-muted-foreground/70">No co-buyer info</p>
            )}
          </div>
        )}
      </div>

      {/* Assigned To */}
      <div className="space-y-2">
        <SectionHeader>Assigned To</SectionHeader>
        <Select value={contact.assigned_to ?? undefined} onValueChange={(v) => saveWithLog('assigned_to', v)}>
          <SelectTrigger className="h-9 text-sm bg-card"><SelectValue placeholder="Select agent" /></SelectTrigger>
          <SelectContent>
            {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
