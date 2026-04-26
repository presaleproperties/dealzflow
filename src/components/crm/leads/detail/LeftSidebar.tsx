import { useState } from 'react';
import { Phone, Mail, Send, MessageCircle, ChevronDown, ChevronUp, MoreVertical, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InlineEditField } from '@/components/crm/leads/InlineEditField';
import { formatContactName } from '@/lib/format';
import { EditLeadDetailsSheet } from './EditLeadDetailsSheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatPhone } from '@/lib/format';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { useCrmSources } from '@/hooks/useCrmSources';
import { LEAD_STATUSES, AGENTS, LEAD_TYPES, LEAD_TYPE_LABELS, LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { InlineLibraryPicker } from '@/components/crm/leads/InlineLibraryPicker';
import { SourcePicker } from '@/components/crm/leads/SourcePicker';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileMultiPickerDrawer } from '@/components/crm/leads/MobileMultiPickerDrawer';
import { MobileTextEditDrawer } from '@/components/crm/leads/MobileTextEditDrawer';
import { MobileEditRow } from '@/components/crm/leads/MobileEditRow';
import { formatMonthDay, MonthDayInput } from '@/components/crm/leads/MonthDayInput';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadScore } from './types';
import { SectionHeader, InsightCard, DetailRow } from './shared';
import { CopyButton } from './CopyButton';

interface Props {
  contact: CrmContact;
  leadScore: LeadScore;
  lastTouchLabel: string;
  daysInPipeline: number;
  onCall?: () => void;
  onSms?: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
}

export function LeftSidebar({
  contact, leadScore, lastTouchLabel, daysInPipeline, onCall, onSms, onEmail, onWhatsApp,
}: Props) {
  const updateContact = useUpdateCrmContact();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [coBuyerOpen, setCoBuyerOpen] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile();
  // Mobile drawer router — single state lets us animate one drawer at a time
  // and avoid stacked sheets which feel heavy on phone.
  const [drawer, setDrawer] = useState<
    | null
    | 'status' | 'assigned_to' | 'source' | 'city' | 'language'
    | 'lead_type' | 'tags' | 'projects'
    | 'bedrooms' | 'budget_min' | 'budget_max' | 'birthday'
    | 'email_secondary' | 'phone_secondary' | 'notes'
    | 'co_buyer_name' | 'co_buyer_phone' | 'co_buyer_email'
  >(null);
  const closeDrawer = () => setDrawer(null);

  const { data: tagLib = [] } = useCrmTags();
  const { data: projectLib = [] } = useCrmProjects();
  const { data: leadTypeLib = [] } = useCrmLeadTypes();
  const { data: librarySources = [] } = useCrmSources();
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

  const showActionRow = !!(onCall || onSms || onEmail || onWhatsApp);
  const contactExt = contact as unknown as Record<string, unknown>;
  const leadTypesArr = (contactExt.lead_types as string[] | undefined) ?? [];
  const syncSource = contactExt.sync_source as string | undefined;
  const loftyId = contactExt.lofty_id as string | undefined;
  const loftySyncedAt = contactExt.lofty_synced_at as string | undefined;

  return (
    <div className="space-y-6">
      {/* Identity card — read-only display; tap ⋯ menu to edit everything in a side drawer */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-2xl font-bold text-foreground leading-[1.15] tracking-tight truncate">
              {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
            </h1>
            {contact.source && (
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground truncate">
                {contact.source}
              </p>
            )}
            {(() => {
              const types = (leadTypesArr.length ? leadTypesArr : contact.lead_type ? [contact.lead_type] : []).slice(0, 3);
              if (types.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {types.map((t) => (
                    <span key={t} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded-md px-2 py-1">
                      {LEAD_TYPE_LABELS[t] || t}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
          {/* ⋯ menu — opens the full edit drawer */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Lead options"
                className="shrink-0 -mr-1 -mt-1 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit lead details
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }}
                className="text-destructive focus:text-destructive gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(contact.phone || contact.email) && (
          <div className="space-y-1.5 pt-3 border-t border-border/60">
            {contact.phone && (
              <div className="flex items-center justify-between gap-2">
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-2 min-w-0 text-[13px] text-foreground hover:text-primary transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium tabular-nums">{formatPhone(contact.phone)}</span>
                </a>
                <CopyButton value={contact.phone} label="phone" />
              </div>
            )}
            {contact.email && (
              <div className="flex items-center justify-between gap-2">
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-2 min-w-0 text-[13px] text-foreground hover:text-primary transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </a>
                <CopyButton value={contact.email} label="email" />
              </div>
            )}
          </div>
        )}
      </div>

      <EditLeadDetailsSheet contact={contact} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatContactName(contact.first_name, contact.last_name) || 'This lead'} will be permanently removed along with their notes, messages, and activity. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                setDeleting(true);
                try {
                  const { error } = await supabase.from('crm_contacts').delete().eq('id', contact.id);
                  if (error) throw error;
                  toast.success('Lead deleted');
                  queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
                  setDeleteOpen(false);
                  navigate('/crm/leads');
                } catch (err) {
                  toast.error(`Delete failed: ${(err as Error).message}`);
                } finally {
                  setDeleting(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete lead'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showActionRow && (
        <div className={`grid gap-2 ${onWhatsApp ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
          {onWhatsApp && (
            <button
              onClick={onWhatsApp}
              disabled={!contact.phone}
              className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-[#25D366]/10 border border-[#25D366]/40 hover:border-[#25D366]/70 hover:bg-[#25D366]/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="WhatsApp"
            >
              <MessageCircle className="w-4 h-4 text-[#1DA851] group-hover:scale-110 transition-transform" strokeWidth={2} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1DA851]/90 group-hover:text-[#1DA851]">WhatsApp</span>
            </button>
          )}
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
        {isMobile ? (
          <MobileEditRow
            label="Stage"
            value={contact.status ?? 'New Lead'}
            onClick={() => setDrawer('status')}
          />
        ) : (
          <Select value={contact.status ?? 'New Lead'} onValueChange={(v) => saveWithLog('status', v)}>
            <SelectTrigger className="h-9 text-sm bg-card border-border font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
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
          {isMobile ? (
            <>
              <MobileEditRow label="Source" value={contact.source || ''} placeholder="Select source" onClick={() => setDrawer('source')} />
              {/* Email 2 / Phone 2 — only render when present.
                  When empty, expose a compact "+ add" affordance so the editor
                  is still reachable without reserving a blank labeled row. */}
              {contact.email_secondary && (
                <MobileEditRow label="Email 2" value={contact.email_secondary} placeholder="Add" onClick={() => setDrawer('email_secondary')} />
              )}
              {contact.phone_secondary && (
                <MobileEditRow label="Phone 2" value={formatPhone(contact.phone_secondary)} placeholder="Add" onClick={() => setDrawer('phone_secondary')} />
              )}
              {(!contact.email_secondary || !contact.phone_secondary) && (
                <div className="flex items-center gap-2 py-1.5">
                  {!contact.email_secondary && (
                    <button
                      type="button"
                      onClick={() => setDrawer('email_secondary')}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border/70 hover:border-foreground/40 transition-colors"
                    >
                      + Add email
                    </button>
                  )}
                  {!contact.phone_secondary && (
                    <button
                      type="button"
                      onClick={() => setDrawer('phone_secondary')}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border/70 hover:border-foreground/40 transition-colors"
                    >
                      + Add phone
                    </button>
                  )}
                </div>
              )}
              <MobileEditRow label="City" value={contact.city || ''} placeholder="Select" onClick={() => setDrawer('city')} />
              <MobileEditRow label="Language" value={contact.language || ''} placeholder="Select" onClick={() => setDrawer('language')} />
              <MobileEditRow label="Beds" value={contact.bedrooms_preferred || ''} placeholder="e.g. 2-3" onClick={() => setDrawer('bedrooms')} />
              <MobileEditRow
                label="Budget min"
                value={contact.budget_min != null ? formatCurrency(Number(contact.budget_min)) : ''}
                placeholder="Add"
                onClick={() => setDrawer('budget_min')}
              />
              <MobileEditRow
                label="Budget max"
                value={contact.budget_max != null ? formatCurrency(Number(contact.budget_max)) : ''}
                placeholder="Add"
                onClick={() => setDrawer('budget_max')}
              />
              <MobileEditRow label="Birthday" value={formatMonthDay(contact.birthday) || contact.birthday || ''} placeholder="Add" onClick={() => setDrawer('birthday')} />
              <MobileEditRow label="Notes" value={contact.notes ? (contact.notes.length > 40 ? contact.notes.slice(0, 40) + '…' : contact.notes) : ''} placeholder="Add notes" onClick={() => setDrawer('notes')} />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 group">
                <span className="text-xs text-muted-foreground shrink-0">Source</span>
                <div className="flex-1 min-w-0 flex justify-end">
                  <SourcePicker value={contact.source} onChange={(v) => save('source', v)} />
                </div>
              </div>
              {/* Email 2 / Phone 2 — only render when present. Otherwise expose
                  small "+ Add" pills so the user can still attach a secondary
                  contact when needed. */}
              {contact.email_secondary && (
                <DetailRow label="Email 2" value={contact.email_secondary} field="email_secondary" contactId={contact.id} type="email" />
              )}
              {contact.phone_secondary && (
                <DetailRow label="Phone 2" value={contact.phone_secondary} field="phone_secondary" contactId={contact.id} displayFormatter={formatPhone} />
              )}
              {(!contact.email_secondary || !contact.phone_secondary) && (
                <div className="flex items-center gap-2 py-2 border-b border-border/40">
                  {!contact.email_secondary && (
                    <button
                      type="button"
                      onClick={() => save('email_secondary', prompt('Secondary email') || null)}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border/70 hover:border-foreground/40 transition-colors"
                    >
                      + Add email
                    </button>
                  )}
                  {!contact.phone_secondary && (
                    <button
                      type="button"
                      onClick={() => save('phone_secondary', prompt('Secondary phone') || null)}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border/70 hover:border-foreground/40 transition-colors"
                    >
                      + Add phone
                    </button>
                  )}
                </div>
              )}

              {/* City + Language — multi-select to match mobile */}
              <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40">
                <span className="text-xs text-muted-foreground shrink-0 pt-1">City</span>
                <div className="flex-1 min-w-0">
                  <InlineLibraryPicker
                    selected={contact.city ? contact.city.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
                    library={FRASER_VALLEY_CITIES.map((c) => ({ label: c, count: 0 }))}
                    onChange={(next) => save('city', next.join(' | ') || null)}
                    placeholder="Search or add city…"
                    emptyText="No cities"
                  />
                </div>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40">
                <span className="text-xs text-muted-foreground shrink-0 pt-1">Language</span>
                <div className="flex-1 min-w-0">
                  <InlineLibraryPicker
                    selected={contact.language ? contact.language.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
                    library={CRM_LANGUAGES.map((l) => ({ label: l, count: 0 }))}
                    onChange={(next) => save('language', next.join(' | ') || null)}
                    placeholder="Search or add language…"
                    emptyText="No languages"
                  />
                </div>
              </div>

              <DetailRow label="Beds" value={contact.bedrooms_preferred} field="bedrooms_preferred" contactId={contact.id} />

              <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
                <span className="text-xs text-muted-foreground">Budget</span>
                <span className="text-[13px] text-foreground font-medium tabular-nums">
                  {contact.budget_min != null ? formatCurrency(Number(contact.budget_min)) : '—'} – {contact.budget_max != null ? formatCurrency(Number(contact.budget_max)) : '—'}
                </span>
              </div>

              <BirthdayDesktopRow contactId={contact.id} value={contact.birthday} />
            </>
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

      {/* Assigned To — placed right after Details so ownership sits with the lead facts.
          Uses a gentle slide-in so it feels smooth when swiping back into the lead detail on mobile. */}
      <div
        className="space-y-2 animate-fade-in motion-safe:[animation-duration:420ms] [animation-delay:60ms] [animation-fill-mode:both] will-change-transform"
        style={{ contain: 'layout paint' }}
      >
        <SectionHeader>Assigned To</SectionHeader>
        {isMobile ? (
          <MobileEditRow
            label="Agent"
            value={contact.assigned_to || ''}
            placeholder="Unassigned"
            onClick={() => setDrawer('assigned_to')}
          />
        ) : (
          <Select value={contact.assigned_to ?? undefined} onValueChange={(v) => saveWithLog('assigned_to', v)}>
            <SelectTrigger className="h-9 text-sm bg-card transition-all duration-200"><SelectValue placeholder="Select agent" /></SelectTrigger>
            <SelectContent>
              {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Lead Type */}
      <div className="space-y-2">
        <SectionHeader>Lead Type</SectionHeader>
        {(() => {
          const selected: string[] = leadTypesArr.length ? leadTypesArr : contact.lead_type ? [contact.lead_type] : [];
          if (isMobile) {
            return (
              <MobileEditRow
                label="Selected"
                value={selected.length ? selected.map(v => LEAD_TYPE_LABELS[v] ?? v).join(', ') : ''}
                placeholder="Set lead type"
                onClick={() => setDrawer('lead_type')}
              />
            );
          }
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
        {isMobile ? (
          <MobileEditRow
            label="Selected"
            value={tags.length ? tags.join(', ') : ''}
            placeholder="Add tags"
            onClick={() => setDrawer('tags')}
          />
        ) : (
          <InlineLibraryPicker
            selected={tags}
            library={tagLib.map(t => ({ label: t.name, count: t.usage_count }))}
            onChange={(next) => save('tags', next)}
            onCreate={(name) => createTag.mutate(name)}
            placeholder="Search or add tag…"
            emptyText="No tags yet"
          />
        )}
      </div>

      {/* Projects */}
      <div className="space-y-2.5">
        <SectionHeader>Projects</SectionHeader>
        {isMobile ? (
          <MobileEditRow
            label="Selected"
            value={projects.length ? projects.join(', ') : ''}
            placeholder="Add projects"
            onClick={() => setDrawer('projects')}
          />
        ) : (
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
        )}
      </div>

      {/* Co-Buyer */}
      <div className="space-y-2.5">
        <button onClick={() => setCoBuyerOpen(!coBuyerOpen)} className="flex items-center justify-between w-full">
          <SectionHeader>{hasCoBuyer ? 'Co-Buyer' : 'Family Member'}</SectionHeader>
          {coBuyerOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {coBuyerOpen && (
          <div className="space-y-px">
            {isMobile ? (
              <>
                <MobileEditRow label="Name" value={contact.co_buyer_name || ''} onClick={() => setDrawer('co_buyer_name')} />
                <MobileEditRow label="Phone" value={contact.co_buyer_phone ? formatPhone(contact.co_buyer_phone) : ''} onClick={() => setDrawer('co_buyer_phone')} />
                <MobileEditRow label="Email" value={contact.co_buyer_email || ''} onClick={() => setDrawer('co_buyer_email')} />
              </>
            ) : (
              <>
                <DetailRow label="Name" value={contact.co_buyer_name} field="co_buyer_name" contactId={contact.id} />
                <DetailRow label="Phone" value={contact.co_buyer_phone} field="co_buyer_phone" contactId={contact.id} displayFormatter={formatPhone} />
                <DetailRow label="Email" value={contact.co_buyer_email} field="co_buyer_email" contactId={contact.id} type="email" />
              </>
            )}
          </div>
        )}
      </div>
      {/* ── Mobile drawers (rendered once; routed by `drawer` state) ── */}
      {isMobile && (() => {
        const selectedLT = leadTypesArr.length ? leadTypesArr : contact.lead_type ? [contact.lead_type] : [];
        const ltLibMap = new Map<string, { label: string; count: number }>();
        leadTypeLib.forEach(l => ltLibMap.set(l.name.toLowerCase(), { label: l.name, count: l.usage_count }));
        LEAD_TYPES.forEach(t => { if (!ltLibMap.has(t.toLowerCase())) ltLibMap.set(t.toLowerCase(), { label: t, count: 0 }); });
        const ltMerged = Array.from(ltLibMap.values()).sort((a, b) => b.count - a.count);

        const sourceSet = new Set<string>([...LEAD_SOURCES, ...librarySources.map(s => s.name)]);
        if (contact.source) sourceSet.add(contact.source);
        const sourceOptions = Array.from(sourceSet).sort();

        return (
          <>
            <MobileMultiPickerDrawer
              open={drawer === 'status'} onOpenChange={(o) => !o && closeDrawer()}
              title="Pipeline Stage"
              options={LEAD_STATUSES.map(s => ({ value: s, label: s }))}
              value={contact.status ? [contact.status] : []}
              onChange={(next) => saveWithLog('status', next[0] ?? 'New Lead')}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'assigned_to'} onOpenChange={(o) => !o && closeDrawer()}
              title="Assigned To"
              options={AGENTS.map(a => ({ value: a, label: a }))}
              value={contact.assigned_to ? [contact.assigned_to] : []}
              onChange={(next) => saveWithLog('assigned_to', next[0] ?? null)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'source'} onOpenChange={(o) => !o && closeDrawer()}
              title="Source"
              options={sourceOptions.map(s => ({ value: s, label: s }))}
              value={contact.source ? [contact.source] : []}
              onChange={(next) => save('source', next[0] ?? null)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'city'} onOpenChange={(o) => !o && closeDrawer()}
              title="City"
              options={FRASER_VALLEY_CITIES.map(c => ({ value: c, label: c }))}
              value={contact.city ? contact.city.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
              onChange={(next) => save('city', next.join(' | ') || null)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'language'} onOpenChange={(o) => !o && closeDrawer()}
              title="Language"
              options={CRM_LANGUAGES.map(l => ({ value: l, label: l }))}
              value={contact.language ? contact.language.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
              onChange={(next) => save('language', next.join(' | ') || null)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'lead_type'} onOpenChange={(o) => !o && closeDrawer()}
              title="Lead Type"
              options={ltMerged.map(o => ({ value: o.label, label: LEAD_TYPE_LABELS[o.label] ?? o.label, count: o.count }))}
              value={selectedLT}
              onChange={(next) => updateContact.mutate({
                id: contact.id,
                updates: { lead_types: next, lead_type: next[0] ?? null },
                oldValues: { lead_types: selectedLT, lead_type: contact.lead_type },
              })}
              onCreate={(name) => createLeadType.mutate(name)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'tags'} onOpenChange={(o) => !o && closeDrawer()}
              title="Tags"
              options={tagLib.map(t => ({ value: t.name, label: t.name, count: t.usage_count }))}
              value={tags}
              onChange={(next) => save('tags', next)}
              onCreate={(name) => createTag.mutate(name)}
            />
            <MobileMultiPickerDrawer
              open={drawer === 'projects'} onOpenChange={(o) => !o && closeDrawer()}
              title="Projects"
              options={projectLib.map(p => ({ value: p.name, label: p.name, count: p.usage_count }))}
              value={projects}
              onChange={(next) => updateContact.mutate({
                id: contact.id,
                updates: { projects: next, project: next[0] ?? null },
                oldValues: { projects: contact.projects ?? [], project: contact.project },
              })}
              onCreate={(name) => createProject.mutate(name)}
            />

            {/* Text drawers */}
            <MobileTextEditDrawer
              open={drawer === 'email_secondary'} onOpenChange={(o) => !o && closeDrawer()}
              title="Email 2" type="email" placeholder="name@example.com"
              value={contact.email_secondary ?? ''}
              onSave={(v) => save('email_secondary', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'phone_secondary'} onOpenChange={(o) => !o && closeDrawer()}
              title="Phone 2" type="tel" placeholder="+1 …"
              value={contact.phone_secondary ?? ''}
              onSave={(v) => save('phone_secondary', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'notes'} onOpenChange={(o) => !o && closeDrawer()}
              title="Notes" type="textarea" placeholder="Internal notes about this lead…"
              value={contact.notes ?? ''}
              onSave={(v) => save('notes', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'bedrooms'} onOpenChange={(o) => !o && closeDrawer()}
              title="Bedrooms" placeholder="e.g. 2-3"
              value={contact.bedrooms_preferred ?? ''}
              onSave={(v) => save('bedrooms_preferred', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'budget_min'} onOpenChange={(o) => !o && closeDrawer()}
              title="Budget Min" type="number" placeholder="0"
              value={contact.budget_min != null ? String(contact.budget_min) : ''}
              onSave={(v) => save('budget_min', v ? Number(v) : null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'budget_max'} onOpenChange={(o) => !o && closeDrawer()}
              title="Budget Max" type="number" placeholder="0"
              value={contact.budget_max != null ? String(contact.budget_max) : ''}
              onSave={(v) => save('budget_max', v ? Number(v) : null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'birthday'} onOpenChange={(o) => !o && closeDrawer()}
              title="Birthday" placeholder="Pick month & day"
              type="monthday"
              description="Just the month and day — we don't need a year."
              value={contact.birthday ?? ''}
              onSave={(v) => save('birthday', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'co_buyer_name'} onOpenChange={(o) => !o && closeDrawer()}
              title="Co-Buyer Name" placeholder="Full name"
              value={contact.co_buyer_name ?? ''}
              onSave={(v) => save('co_buyer_name', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'co_buyer_phone'} onOpenChange={(o) => !o && closeDrawer()}
              title="Co-Buyer Phone" type="tel" placeholder="+1 …"
              value={contact.co_buyer_phone ?? ''}
              onSave={(v) => save('co_buyer_phone', v || null)}
            />
            <MobileTextEditDrawer
              open={drawer === 'co_buyer_email'} onOpenChange={(o) => !o && closeDrawer()}
              title="Co-Buyer Email" type="email" placeholder="name@example.com"
              value={contact.co_buyer_email ?? ''}
              onSave={(v) => save('co_buyer_email', v || null)}
            />
          </>
        );
      })()}
    </div>
  );
}

/** Desktop birthday editor — popover with Month + Day selects. */
function BirthdayDesktopRow({ contactId, value }: { contactId: string; value: string | null | undefined }) {
  const updateContact = useUpdateCrmContact();
  const [open, setOpen] = useState(false);
  const display = formatMonthDay(value) || value || '';
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/40 group">
      <span className="text-xs text-muted-foreground shrink-0">Birthday</span>
      <BirthdayPopover
        open={open}
        onOpenChange={setOpen}
        value={value ?? ''}
        onSave={(v) => updateContact.mutate({ id: contactId, updates: { birthday: v || null } })}
        trigger={
          <button
            type="button"
            className="text-[13px] text-right truncate max-w-full hover:text-primary transition-colors"
          >
            {display || <span className="text-muted-foreground italic">Add</span>}
          </button>
        }
      />
    </div>
  );
}

function BirthdayPopover({
  open, onOpenChange, value, onSave, trigger,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string;
  onSave: (v: string) => void;
  trigger: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Popover open={open} onOpenChange={(o: boolean) => { onOpenChange(o); if (o) setDraft(value); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-3 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Birthday</p>
        <MonthDayInput value={draft} onChange={setDraft} />
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => { setDraft(''); onSave(''); onOpenChange(false); }}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => { onSave(draft); onOpenChange(false); }}
            className="px-3 h-8 text-[12px] font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

