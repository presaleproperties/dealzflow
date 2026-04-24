import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, ChevronLeft, ChevronRight,
  Calendar, Plus, ListTodo,
  StickyNote, Zap, Send, Pin, PinOff, Pencil, MoreHorizontal, Trash2,
  Download, ArrowUpRight, ArrowDownLeft, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatContactName, formatCurrency } from '@/lib/format';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCrmContact, useCrmContactMessages, useCrmContactShowings, useCrmContactTasks, useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useCrmContacts, LEAD_STATUSES, AGENTS, LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { useLeadNotes, useAddNote, useUpdateNote, useDeleteNote, type CrmNote } from '@/hooks/useCrmNotes';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useAuth } from '@/hooks/useAuth';
import { InlineEditField } from '@/components/crm/leads/InlineEditField';
import { PresaleActivityWidget } from '@/components/crm/leads/PresaleActivityWidget';
import { LeadEmailAttribution } from '@/components/crm/leads/LeadEmailAttribution';
import { LeadActivityDiagnostics } from '@/components/crm/leads/LeadActivityDiagnostics';
import { BookShowingDialog } from '@/components/crm/leads/BookShowingDialog';
import { CreateTaskDialog } from '@/components/crm/leads/CreateTaskDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { formatNoteContent, LinkifiedText } from '@/lib/formatNoteContent';
import { Globe, MessageSquare } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { InlineLibraryPicker } from '@/components/crm/leads/InlineLibraryPicker';

/* ─── Type styles (text-only, editorial) ─── */
const TYPE_LABELS: Record<string, string> = {
  lead: 'LEAD',
  realtor: 'REALTOR',
  past_client: 'CLIENT',
};

/* ─── Helpers ─── */
function getDateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

/** Effective timestamp for a note: prefer event_at (real activity time)
 *  and fall back to created_at (import time). */
function noteTime(n: CrmNote): string {
  return n.event_at || n.created_at;
}

/* ═══════════════════════════════════════════════════
   TOP BAR — Lead identity + global actions + nav
   ═══════════════════════════════════════════════════ */
function LeadTopBar({
  contact,
  navInfo,
  onNavigate,
  onTask,
  onShowing,
}: {
  contact: CrmContact;
  navInfo: { index: number; total: number } | null;
  onNavigate: (dir: 'prev' | 'next') => void;
  onTask: () => void;
  onShowing: () => void;
}) {
  const typeLabel = TYPE_LABELS[contact.contact_type] ?? 'LEAD';



  return (
    <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0 flex items-center justify-between gap-4">
      {/* Left: Back + identity */}
      <div className="flex items-center gap-4 min-w-0">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Leads
        </Link>
        <div className="h-5 w-px bg-border shrink-0" />
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight truncate">
            {formatContactName(contact.first_name, contact.last_name)}
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Right: Primary CTAs + nav (call/email live in the sidebar) */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={onTask}>
          <ListTodo className="w-3.5 h-3.5" /> Task
        </Button>
        <Button size="sm" className="h-9 text-xs gap-1.5" onClick={onShowing}>
          <Calendar className="w-3.5 h-3.5" /> Book Showing
        </Button>

        {navInfo && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <button onClick={() => onNavigate('prev')} disabled={navInfo.index <= 0} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">
              {navInfo.index + 1} / {navInfo.total}
            </span>
            <button onClick={() => onNavigate('next')} disabled={navInfo.index >= navInfo.total - 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LEFT SIDEBAR — Pipeline, Insight, Details, Tags
   ═══════════════════════════════════════════════════ */
function LeftSidebar({
  contact,
  leadScore,
  lastTouchLabel,
  daysInPipeline,
  onCall,
  onSms,
  onEmail,
}: {
  contact: CrmContact;
  leadScore: { score: number; color: string; label: string };
  lastTouchLabel: string;
  daysInPipeline: number;
  onCall?: () => void;
  onSms?: () => void;
  onEmail?: () => void;
}) {
  const updateContact = useUpdateCrmContact();
  const [coBuyerOpen, setCoBuyerOpen] = useState(true);

  // Unified library data — sourced from crm_tags / crm_projects / crm_lead_types tables.
  // These are auto-synced from EVERY contact (lead, realtor, past_client) via triggers,
  // so creating any of these here makes them instantly searchable everywhere in the CRM.
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
      oldValues: { [field]: (contact as any)[field] },
    });
  };

  const showActionRow = !!(onCall || onSms || onEmail);

  return (
    <div className="space-y-6">
      {/* Identity card — name + key contact info above the pipeline stage */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold text-foreground leading-[1.15] tracking-tight truncate">
              {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
            </h2>
            {contact.source && (
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mt-1.5 truncate">
                {contact.source}
              </p>
            )}
          </div>
          {(((contact as any).lead_types as string[] | undefined)?.length
            ? ((contact as any).lead_types as string[])
            : contact.lead_type ? [contact.lead_type] : []
          ).slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded-md px-2 py-1 shrink-0">
              {LEAD_TYPE_LABELS[t] || t}
            </span>
          ))}
        </div>
        <div className="space-y-1.5 pt-3 border-t border-border/60">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 text-sm font-medium text-foreground hover:text-primary transition-colors group">
              <Phone className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <span className="truncate">{contact.phone}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
              <Phone className="w-3.5 h-3.5 shrink-0" /> <span>No phone</span>
            </div>
          )}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 text-sm font-medium text-foreground hover:text-primary transition-colors group">
              <Mail className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <span className="truncate">{contact.email}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
              <Mail className="w-3.5 h-3.5 shrink-0" /> <span>No email</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick action row — Call / Text / Email (above pipeline stage) */}
      {showActionRow && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onCall}
            disabled={!contact.phone}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Call"
          >
            <Phone className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">Call</span>
          </button>
          <button
            onClick={onSms}
            disabled={!contact.phone}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Text"
          >
            <Send className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">Text</span>
          </button>
          <button
            onClick={onEmail}
            disabled={!contact.email}
            className="group flex flex-col items-center justify-center gap-1 h-14 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Email"
          >
            <Mail className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">Email</span>
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
          <InsightCard value={lastTouchLabel} label="Last Touch" />
          <InsightCard value={`${daysInPipeline}d`} label="In Pipeline" />
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3">
        <SectionHeader>Details</SectionHeader>
        <div className="space-y-px">
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

          {((contact as any).sync_source === 'zapier_lofty' || (contact as any).sync_source === 'lofty_api_sync') && (
            <>
              {(contact as any).lofty_id && (
                <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">Lofty ID</span>
                  <span className="text-[11px] font-mono text-muted-foreground/80 truncate max-w-[140px]">{(contact as any).lofty_id}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-xs text-muted-foreground">Synced</span>
                <span className="text-[11px] text-muted-foreground/80">
                  {(contact as any).lofty_synced_at ? format(new Date((contact as any).lofty_synced_at), 'MMM d, h:mm a') : 'via Lofty'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lead Type — multi-select, backed by unified library */}
      <div className="space-y-2">
        <SectionHeader>Lead Type</SectionHeader>
        {(() => {
          const selected: string[] = ((contact as any).lead_types as string[] | undefined)?.length
            ? ((contact as any).lead_types as string[])
            : contact.lead_type ? [contact.lead_type] : [];
          // Merge canonical defaults with the live library so we always show every option,
          // even if a value isn't yet in the library table.
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

      {/* Tags — unified library across all contacts (leads, realtors, past clients) */}
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

      {/* Projects — unified library, multi-select */}
      <div className="space-y-2.5">
        <SectionHeader>Projects</SectionHeader>
        <InlineLibraryPicker
          selected={projects}
          library={projectLib.map(p => ({ label: p.name, count: p.usage_count }))}
          onChange={(next) => {
            // Mirror to legacy single `project` field for back-compat with older code paths.
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

      {/* Co-Buyer / Family Member */}
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
                <DetailRow label="Phone" value={contact.co_buyer_phone} field="co_buyer_phone" contactId={contact.id} />
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

/* ─── Small reusable pieces ─── */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">{children}</h3>;
}

function InsightCard({ value, label, sublabel, accent }: { value: React.ReactNode; label: string; sublabel?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-2.5 py-3 text-center space-y-1">
      <p className="text-xl font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight uppercase tracking-[0.1em] font-medium">{label}</p>
      {sublabel && <p className="text-[10px] font-semibold leading-tight tracking-wider" style={{ color: accent }}>{sublabel}</p>}
    </div>
  );
}

function DetailRow({ label, value, href, field, contactId, type, options }: {
  label: string; value: string | null | undefined; href?: string; field: string; contactId: string; type?: 'text' | 'email' | 'select'; options?: readonly string[];
}) {
  const updateContact = useUpdateCrmContact();
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 group">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex justify-end">
        <InlineEditField
          value={value}
          onSave={(v) => updateContact.mutate({ id: contactId, updates: { [field]: v || null } })}
          href={href}
          type={type}
          options={options}
          className="text-[13px] text-right truncate max-w-full"
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CENTER COLUMN — Activity Timeline
   ═══════════════════════════════════════════════════ */
type FilterType = 'all' | 'manual' | 'email' | 'call_log' | 'web' | 'system';

type NoteMeta = { icon: typeof StickyNote; label: string; tint: string };

// Distinct accent colors per channel — HSL strings applied to the icon + ring.
const NOTE_TYPE_META: Record<string, NoteMeta> = {
  manual:   { icon: StickyNote,    label: 'Note',         tint: '45 90% 55%'  }, // gold (brand)
  note:     { icon: StickyNote,    label: 'Note',         tint: '45 90% 55%'  },
  email:    { icon: Mail,          label: 'Email',        tint: '210 85% 58%' }, // blue
  call_log: { icon: Phone,         label: 'Call',         tint: '142 70% 45%' }, // green
  sms:      { icon: MessageSquare, label: 'Text',         tint: '270 70% 60%' }, // purple
  text:     { icon: MessageSquare, label: 'Text',         tint: '270 70% 60%' },
  system:   { icon: Zap,           label: 'System',       tint: '220 10% 55%' }, // neutral
  import:   { icon: Download,      label: 'Imported',     tint: '220 10% 55%' },
  zapier:   { icon: Globe,         label: 'Web activity', tint: '180 60% 45%' }, // teal
};

const FALLBACK_META: NoteMeta = { icon: StickyNote, label: 'Note', tint: '45 90% 55%' };

/** Refine the note's display meta based on parsed content (e.g. detect website behavior). */
function metaForNote(note: CrmNote): NoteMeta {
  const base = NOTE_TYPE_META[note.note_type] || FALLBACK_META;
  if (/website behavior summary/i.test(note.content)) {
    return { icon: Globe, label: 'Web activity', tint: '180 60% 45%' };
  }
  if (/inquired on|system auto-updated/i.test(note.content) && note.note_type === 'note') {
    return { icon: Download, label: 'Inquiry', tint: '220 10% 55%' };
  }
  return base;
}

function CenterColumn({ contact }: { contact: CrmContact }) {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: rawNotes = [] } = useLeadNotes(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const { data: emailLog = [] } = useCrmEmailLog(contact.id);
  const addNote = useAddNote();
  const updateNote = useUpdateNote();

  // Merge real notes with virtual entries synthesized from the email log so
  // every sent / received email shows up in the central timeline alongside notes.
  const notes = useMemo<CrmNote[]>(() => {
    const emailNotes: CrmNote[] = (emailLog ?? []).map((e: any) => {
      const direction = e.direction === 'inbound' ? 'Received' : 'Sent';
      const subject = e.subject || '(no subject)';
      const preview = (e.body_text || e.body_html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
      return {
        id: `email-${e.id}`,
        contact_id: contact.id,
        user_id: e.sent_by || '',
        content: `Subject: ${subject}\nDirection: ${direction}${e.from_email ? `\nFrom: ${e.from_email}` : ''}${e.to_email ? `\nTo: ${e.to_email}` : ''}${preview ? `\n\n${preview}` : ''}`,
        note_type: 'email',
        is_pinned: false,
        created_at: e.sent_at || e.created_at || new Date().toISOString(),
        updated_at: e.sent_at || e.created_at || new Date().toISOString(),
        event_at: e.sent_at || e.created_at || null,
      };
    });
    const merged = [...rawNotes, ...emailNotes];
    const ts = (n: CrmNote) => new Date(n.event_at || n.created_at).getTime();
    return merged.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return ts(b) - ts(a);
    });
  }, [rawNotes, emailLog, contact.id]);

  const [draft, setDraft] = useState('');
  const [noteType, setNoteType] = useState('manual');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const isWebActivity = (n: CrmNote) =>
    /website behavior summary/i.test(n.content) || n.note_type === 'zapier';
  const isManualLike = (n: CrmNote) =>
    (n.note_type === 'manual' || n.note_type === 'note' || n.note_type === 'import') && !isWebActivity(n);

  const filteredNotes = useMemo(() => {
    if (filter === 'all') return notes;
    if (filter === 'manual') return notes.filter(isManualLike);
    if (filter === 'web') return notes.filter(isWebActivity);
    return notes.filter(n => n.note_type === filter);
  }, [notes, filter]);

  const pinnedNotes = useMemo(() => filteredNotes.filter(n => n.is_pinned), [filteredNotes]);
  const unpinnedNotes = useMemo(() => filteredNotes.filter(n => !n.is_pinned), [filteredNotes]);

  const groupedNotes = useMemo(() => {
    const groups: { label: string; notes: CrmNote[] }[] = [];
    let currentLabel = '';
    unpinnedNotes.forEach(note => {
      const label = getDateGroup(noteTime(note));
      if (label !== currentLabel) {
        groups.push({ label, notes: [note] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].notes.push(note);
      }
    });
    return groups;
  }, [unpinnedNotes]);

  const counts = useMemo(() => ({
    all: notes.length,
    manual: notes.filter(isManualLike).length,
    email: notes.filter(n => n.note_type === 'email').length,
    call_log: notes.filter(n => n.note_type === 'call_log').length,
    web: notes.filter(isWebActivity).length,
    system: notes.filter(n => n.note_type === 'system').length,
  }), [notes]);

  const handleSave = () => {
    if (!draft.trim()) return;
    addNote.mutate({ contact_id: contact.id, content: draft.trim(), note_type: noteType });
    setDraft('');
  };

  const handleEditSave = (noteId: string) => {
    if (!editContent.trim()) return;
    updateNote.mutate({ id: noteId, contactId: contact.id, updates: { content: editContent.trim() } });
    setEditingId(null);
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'manual', label: 'Notes' },
    { key: 'email', label: 'Emails' },
    { key: 'call_log', label: 'Calls' },
    { key: 'web', label: 'Web' },
    { key: 'system', label: 'System' },
  ];

  return (
    <Tabs defaultValue="overview" className="flex flex-col h-full">
      <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 flex-shrink-0 px-5">
        <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] px-4 py-3 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground">
          Activity
        </TabsTrigger>
        <TabsTrigger value="showings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[13px] px-4 py-3 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground">
          Appointments
          {showings.length > 0 && (
            <span className="ml-2 text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal tabular-nums">
              {showings.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 p-6 space-y-5">
        {/* Compose */}
        <div className="bg-card rounded-xl border border-border p-3.5 space-y-3">
          <div className="flex items-center gap-3">
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger className="w-[120px] h-9 text-sm border-border/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Note</SelectItem>
                <SelectItem value="call_log">Call Log</SelectItem>
                <SelectItem value="email">Email Log</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">⌘ + Enter to send</span>
          </div>
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a note, log a call, or capture context…"
            className="text-sm min-h-[72px] resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" className="h-9 text-xs gap-1.5" onClick={handleSave} disabled={!draft.trim() || addNote.isPending}>
              <Send className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-all uppercase tracking-[0.08em]',
                filter === f.key
                  ? 'bg-foreground text-background'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {f.label}
              {counts[f.key] > 0 && <span className="ml-1.5 opacity-60 normal-case tracking-normal tabular-nums">{counts[f.key]}</span>}
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative space-y-1.5">
          {(pinnedNotes.length > 0 || groupedNotes.length > 0) && (
            <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border/40" />
          )}

          {pinnedNotes.length > 0 && (
            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-1.5 pl-9">
                <Pin className="w-3 h-3 text-foreground/60" />
                <span className="text-[11px] font-semibold text-foreground/70 uppercase tracking-[0.12em]">Pinned</span>
              </div>
              {pinnedNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isOwn={note.user_id === currentUserId}
                  contactId={contact.id}
                  editingId={editingId}
                  editContent={editContent}
                  onSetEditing={(id, content) => { setEditingId(id); setEditContent(content); }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleEditSave}
                  setEditContent={setEditContent}
                />
              ))}
            </div>
          )}

          {groupedNotes.map(group => (
            <div key={group.label} className="space-y-2 mb-5">
              <div className="pl-9">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">{group.label}</span>
              </div>
              {group.notes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isOwn={note.user_id === currentUserId}
                  contactId={contact.id}
                  editingId={editingId}
                  editContent={editContent}
                  onSetEditing={(id, content) => { setEditingId(id); setEditContent(content); }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleEditSave}
                  setEditContent={setEditContent}
                />
              ))}
            </div>
          ))}

          {filteredNotes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center mb-3">
                <StickyNote className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground/80">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a note above to get started</p>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="showings" className="flex-1 overflow-y-auto mt-0 p-6">
        <ShowingsTab contactId={contact.id} showings={showings} />
      </TabsContent>
    </Tabs>
  );
}

/* Note card */
function NoteCard({ note, isOwn, contactId, editingId, editContent, onSetEditing, onCancelEdit, onSaveEdit, setEditContent }: {
  note: CrmNote; isOwn: boolean; contactId: string;
  editingId: string | null; editContent: string;
  onSetEditing: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  setEditContent: (v: string) => void;
}) {
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const meta = metaForNote(note);
  const Icon = meta.icon;
  const ts = noteTime(note);
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d, yyyy');
  const { parsed, isStructured } = formatNoteContent(note.content);
  const [expanded, setExpanded] = useState(false);
  const visibleFields = isStructured && !expanded ? parsed.fields.slice(0, 4) : parsed.fields;
  const hasMore = isStructured && parsed.fields.length > 4;
  const isVirtual = note.id.startsWith('email-');

  if (editingId === note.id) {
    return (
      <div className="pl-10 space-y-2">
        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="text-sm min-h-[80px]" autoFocus />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelEdit}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => onSaveEdit(note.id)}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex gap-3">
      <div
        className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border bg-background"
        style={{
          borderColor: `hsl(${meta.tint} / 0.45)`,
          background: `hsl(${meta.tint} / 0.10)`,
        }}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={2} style={{ color: `hsl(${meta.tint})` }} />
      </div>
      <div className={cn(
        'flex-1 min-w-0 rounded-lg border bg-card px-3.5 py-3 transition-all hover:border-border',
        note.is_pinned ? 'border-foreground/20 bg-muted/30' : 'border-border/50',
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[11px]">
              {isStructured && parsed.title ? parsed.title : meta.label}
            </span>
            {parsed.source && (
              <>
                <span className="opacity-30">·</span>
                <span className="truncate">{parsed.source}</span>
              </>
            )}
            <span className="opacity-30">·</span>
            <span className="shrink-0">{dateLabel} · {time}</span>
            {note.is_pinned && <Pin className="w-3 h-3 text-foreground/60 shrink-0" />}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {!isVirtual && (
              <>
                <button onClick={() => updateNote.mutate({ id: note.id, contactId, updates: { is_pinned: !note.is_pinned } })} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" aria-label={note.is_pinned ? 'Unpin' : 'Pin'}>
                  {note.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                </button>
                <button onClick={() => onSetEditing(note.id, note.content)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" aria-label="Edit">
                  <Pencil className="w-3 h-3" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => deleteNote.mutate({ id: note.id, contactId })} className="text-destructive focus:text-destructive gap-2">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {isStructured ? (
          <div className="mt-2.5 space-y-1">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[13px]">
              {visibleFields.map((f, i) => (
                <div key={`${f.label}-${i}`} className="contents">
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/80 truncate pt-0.5">{f.label}</dt>
                  <dd className="text-foreground/90 break-words"><LinkifiedText text={f.value || '—'} context={{ contactId, noteId: note.id, source: `note_field:${f.label}` }} /></dd>
                </div>
              ))}
            </dl>
            {hasMore && (
              <button onClick={() => setExpanded(e => !e)} className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors mt-1">
                {expanded ? 'Show less' : `Show ${parsed.fields.length - 4} more`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[14px] text-foreground/90 whitespace-pre-wrap mt-2 leading-relaxed"><LinkifiedText text={parsed.body || note.content} context={{ contactId, noteId: note.id, source: `note:${note.note_type || 'manual'}` }} /></p>
        )}
      </div>
    </div>
  );
}

/* Showings tab */
function ShowingsTab({ contactId, showings }: { contactId: string; showings: any[] }) {
  const [showBooking, setShowBooking] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader>Appointments</SectionHeader>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowBooking(true)}>
          <Plus className="w-3.5 h-3.5" /> Book
        </Button>
      </div>
      {showings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center mb-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80">No appointments</p>
          <p className="text-xs text-muted-foreground mt-1">Book a showing to track property visits</p>
        </div>
      ) : (
        <div className="space-y-2">
          {showings.map((s: any) => (
            <div key={s.id} className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-border/60 bg-card hover:border-border transition-colors">
              <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.project}{s.unit ? ` — ${s.unit}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(s.showing_date), 'MMM d, yyyy')} at {s.showing_time}</p>
                {s.notes && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{s.notes}</p>}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                {s.status ?? 'Confirmed'}
              </span>
            </div>
          ))}
        </div>
      )}
      <BookShowingDialog contactId={contactId} project={null} open={showBooking} onOpenChange={setShowBooking} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RIGHT SIDEBAR
   ═══════════════════════════════════════════════════ */
function RightSidebar({ contact, onAddTask, onAddShowing }: { contact: CrmContact; onAddTask: () => void; onAddShowing: () => void }) {
  const { data: tasks = [] } = useCrmContactTasks(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const { data: emails, isLoading: emailsLoading } = useCrmEmailLog(contact.id);

  const now = new Date();
  const pendingTasks = tasks.filter((t: any) => t.status !== 'completed');
  const upcomingShowings = showings
    .filter((s: any) => new Date(s.showing_date) >= now && s.status !== 'cancelled')
    .sort((a: any, b: any) => new Date(a.showing_date).getTime() - new Date(b.showing_date).getTime());

  return (
    <div className="space-y-6">
      {/* Tasks */}
      <WidgetSection title="Tasks" count={pendingTasks.length} onAdd={onAddTask}>
        {pendingTasks.length === 0 ? (
          <EmptyWidget icon={ListTodo} message="No pending tasks" />
        ) : (
          <div className="space-y-1.5">
            {pendingTasks.map((t: any) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </WidgetSection>

      {/* Upcoming Showings */}
      <WidgetSection title="Appointments" count={upcomingShowings.length} onAdd={onAddShowing}>
        {upcomingShowings.length === 0 ? (
          <EmptyWidget icon={Calendar} message="No upcoming appointments" />
        ) : (
          <div className="space-y-2">
            {upcomingShowings.slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-card border border-border/60 hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{s.project}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(s.showing_date), 'MMM d')} · {s.showing_time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetSection>

      {/* Email History */}
      <WidgetSection title="Email Activity">
        {emailsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : !emails || emails.length === 0 ? (
          <EmptyWidget icon={Mail} message="No email activity" />
        ) : (
          <div className="space-y-2">
            {emails.slice(0, 5).map((email: any) => (
              <div key={email.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-card border border-border/60 hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                  {email.direction === 'outbound'
                    ? <ArrowUpRight className="w-4 h-4 text-foreground/70" />
                    : <ArrowDownLeft className="w-4 h-4 text-foreground/70" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{email.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(email.sent_at), 'MMM d · h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetSection>

      {/* Email Attribution (opens / clicks per send) */}
      <WidgetSection title="Email Attribution">
        <LeadEmailAttribution contactId={contact?.id} />
      </WidgetSection>

      {/* Presale Properties Activity */}
      <WidgetSection title="Presale Activity">
        <PresaleActivityWidget contactId={contact?.id} />
      </WidgetSection>

      {/* Activity Diagnostics — why URLs may be missing */}
      <WidgetSection title="Activity Diagnostics">
        <LeadActivityDiagnostics
          contactId={contact?.id}
          contactEmail={contact?.email}
          presaleUserId={(contact as any)?.presale_user_id}
        />
      </WidgetSection>
    </div>
  );
}

/* Widget helpers */
function WidgetSection({ title, count, onAdd, children }: { title: string; count?: number; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <SectionHeader>{title}</SectionHeader>
          {count != null && count > 0 && (
            <span className="text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5 font-semibold tabular-nums">{count}</span>
          )}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="text-muted-foreground hover:text-foreground transition-colors p-0.5" aria-label={`Add ${title.toLowerCase()}`}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyWidget({ icon: Icon, message }: { icon: typeof ListTodo; message: string }) {
  return (
    <div className="flex items-center gap-2.5 py-5 justify-center">
      <Icon className="w-4 h-4 text-muted-foreground/60" />
      <span className="text-[13px] text-muted-foreground">{message}</span>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const qc = useQueryClient();
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
  const completeTask = useMutation({
    mutationFn: async () => {
      const prev = { status: task.status, completed_at: task.completed_at ?? null };
      const { error } = await supabase
        .from('crm_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      return prev;
    },
    onSuccess: (prev) => {
      qc.invalidateQueries({ queryKey: ['crm-contact-tasks', task.contact_id] });
      toast.success('Task completed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error } = await supabase
              .from('crm_tasks')
              .update({ status: prev?.status ?? 'pending', completed_at: prev?.completed_at ?? null })
              .eq('id', task.id);
            if (error) {
              toast.error(`Couldn't undo: ${error.message}`);
              return;
            }
            qc.invalidateQueries({ queryKey: ['crm-contact-tasks', task.contact_id] });
            toast.success('Task restored');
          },
        },
        duration: 6000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className={cn(
      'flex items-start gap-2.5 p-3 rounded-lg bg-card border transition-colors',
      isOverdue ? 'border-destructive/30' : 'border-border/60 hover:border-border'
    )}>
      <Checkbox
        className="mt-0.5 h-4 w-4"
        checked={task.status === 'completed'}
        disabled={completeTask.isPending || task.status === 'completed'}
        onCheckedChange={(checked) => { if (checked) completeTask.mutate(); }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-medium leading-snug', task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground')}>{task.title}</p>
        {task.due_date && (
          <p className={cn('text-xs mt-0.5', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {isOverdue ? 'Overdue · ' : ''}{format(new Date(task.due_date), 'MMM d, yyyy')}
          </p>
        )}
      </div>
      {task.priority === 'high' && (
        <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider shrink-0">High</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: contact, isLoading } = useCrmContact(id);
  const { data: allContacts = [] } = useCrmContacts();
  const { data: messages = [] } = useCrmContactMessages(id);
  const { data: showings = [] } = useCrmContactShowings(id);
  const { data: tasks = [] } = useCrmContactTasks(id);
  const { data: notes = [] } = useLeadNotes(id);

  // Top-level dialog state (so top bar buttons work)
  const [showEmail, setShowEmail] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showShowing, setShowShowing] = useState(false);

  const leadScore = useMemo(() => {
    const inbound = messages.filter((m: any) => m.direction === 'inbound').length;
    const showingCount = showings.length;
    const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
    const noteCount = notes.length;
    const score = Math.min(100, inbound * 10 + showingCount * 15 + completedTasks * 20 + noteCount * 5);
    const color = score >= 61 ? 'hsl(142 71% 45%)' : score >= 31 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';
    const label = score >= 61 ? 'Hot' : score >= 31 ? 'Warm' : 'Cold';
    return { score, color, label };
  }, [messages, showings, tasks, notes]);

  const lastTouchLabel = useMemo(() => {
    if (!contact) return 'N/A';
    const lt = (contact as any).last_touch_at;
    if (!lt) return 'None';
    const diff = Date.now() - new Date(lt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Now';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }, [contact]);

  const daysInPipeline = useMemo(() => {
    if (!contact) return 0;
    return Math.floor((Date.now() - new Date(contact.created_at).getTime()) / 86400000);
  }, [contact]);

  const navInfo = useMemo(() => {
    if (!id || allContacts.length === 0) return null;
    const idx = allContacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    return { index: idx, total: allContacts.length };
  }, [id, allContacts]);

  const handleNavigate = (dir: 'prev' | 'next') => {
    if (!navInfo) return;
    const newIdx = dir === 'prev' ? navInfo.index - 1 : navInfo.index + 1;
    if (newIdx < 0 || newIdx >= navInfo.total) return;
    navigate(`/crm/leads/${allContacts[newIdx].id}`);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0 flex items-center gap-4">
          <Skeleton className="h-4 w-16" />
          <div className="h-5 w-px bg-border" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[360px] flex-shrink-0 border-r border-border bg-muted/30 p-5 space-y-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-3 gap-1.5">
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0 p-6 space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
          <div className="w-[360px] flex-shrink-0 border-l border-border bg-muted/30 p-5 space-y-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-4 w-20 mt-4" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">Lead not found.</p>
        <Link to="/crm/leads" className="text-sm text-foreground hover:underline">← Back to Leads</Link>
      </div>
    );
  }

  const c = contact as CrmContact;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="space-y-3 pb-6">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>

        {/* Top action bar — Task + Book Showing (Call/Email live in LeftSidebar identity card) */}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="h-10 text-xs gap-1.5" onClick={() => setShowTask(true)}>
            <ListTodo className="w-4 h-4" /> Task
          </Button>
          <Button size="sm" className="h-10 text-xs gap-1.5" onClick={() => setShowShowing(true)}>
            <Calendar className="w-4 h-4" /> Book Showing
          </Button>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <LeftSidebar
            contact={c}
            leadScore={leadScore}
            lastTouchLabel={lastTouchLabel}
            daysInPipeline={daysInPipeline}
            onCall={() => c.phone && (window.location.href = `tel:${c.phone}`)}
            onSms={() => c.phone && (window.location.href = `sms:${c.phone}`)}
            onEmail={() => setShowEmail(true)}
          />
        </div>
        <div className="bg-card rounded-lg border border-border overflow-hidden" style={{ minHeight: 400 }}>
          <CenterColumn contact={c} />
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <RightSidebar contact={c} onAddTask={() => setShowTask(true)} onAddShowing={() => setShowShowing(true)} />
        </div>

        <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
        <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
        <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      <LeadTopBar
        contact={c}
        navInfo={navInfo}
        onNavigate={handleNavigate}
        onTask={() => setShowTask(true)}
        onShowing={() => setShowShowing(true)}
      />

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — wider, inspired layout */}
        <div className="w-[360px] flex-shrink-0 border-r border-border bg-muted/30 overflow-y-auto p-5">
          <LeftSidebar
            contact={c}
            leadScore={leadScore}
            lastTouchLabel={lastTouchLabel}
            daysInPipeline={daysInPipeline}
            onCall={() => c.phone && (window.location.href = `tel:${c.phone}`)}
            onSms={() => c.phone && (window.location.href = `sms:${c.phone}`)}
            onEmail={() => setShowEmail(true)}
          />
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          <CenterColumn contact={c} />
        </div>

        {/* Right sidebar */}
        <div className="w-[360px] flex-shrink-0 border-l border-border bg-muted/30 overflow-y-auto p-5">
          <RightSidebar contact={c} onAddTask={() => setShowTask(true)} onAddShowing={() => setShowShowing(true)} />
        </div>
      </div>

      <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
      <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
    </div>
  );
}
