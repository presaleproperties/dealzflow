import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageCircle, Mail, ChevronLeft, ChevronRight,
  Calendar, Plus, ListTodo, CheckCircle2,
  StickyNote, Zap, Send, Pin, PinOff, Pencil, MoreHorizontal, Trash2,
  Download, ArrowUpRight, ArrowDownLeft, X, ChevronDown, ChevronUp,
  Clock, ExternalLink,
} from 'lucide-react';
import { formatContactName, formatCurrency } from '@/lib/format';
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
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
import { BookShowingDialog } from '@/components/crm/leads/BookShowingDialog';
import { CreateTaskDialog } from '@/components/crm/leads/CreateTaskDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';

/* ─── Type styles ─── */
const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  lead: { label: 'Lead', className: 'bg-primary/15 text-primary' },
  realtor: { label: 'Realtor', className: 'bg-blue-500/15 text-blue-500' },
  past_client: { label: 'Client', className: 'bg-emerald-500/15 text-emerald-600' },
};

/* ─── Helpers ─── */
function getDateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

/* ═══════════════════════════════════════════════════
   LEFT SIDEBAR
   ═══════════════════════════════════════════════════ */
function LeftSidebar({
  contact,
  leadScore,
  lastTouchLabel,
  daysInPipeline,
  navInfo,
  onNavigate,
}: {
  contact: CrmContact;
  leadScore: { score: number; color: string; label: string };
  lastTouchLabel: string;
  daysInPipeline: number;
  navInfo: { index: number; total: number } | null;
  onNavigate: (dir: 'prev' | 'next') => void;
}) {
  const updateContact = useUpdateCrmContact();
  const [showEmail, setShowEmail] = useState(false);
  const [showShowing, setShowShowing] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [coBuyerOpen, setCoBuyerOpen] = useState(true);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');

  const typeStyle = TYPE_STYLES[contact.contact_type] ?? TYPE_STYLES.lead;
  const tags = (contact.tags ?? []) as string[];
  const projects = contact.projects?.length ? contact.projects : contact.project ? [contact.project] : [];
  const hasCoBuyer = !!(contact.co_buyer_name || contact.co_buyer_phone || contact.co_buyer_email);

  const save = (field: string, value: unknown) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value } });
  };
  const saveWithLog = (field: string, value: unknown) => {
    updateContact.mutate({ id: contact.id, updates: { [field]: value, ...(field === 'status' ? { status_changed_at: new Date().toISOString() } : {}) }, oldValues: { [field]: (contact as any)[field] } });
  };

  const openWhatsApp = () => {
    if (contact.phone) window.open(`https://wa.me/${contact.phone.replace(/\D/g, '')}`, '_blank');
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    save('tags', [...tags, tag]);
    setNewTag('');
    setAddingTag(false);
  };

  const removeTag = (tag: string) => {
    save('tags', tags.filter(t => t !== tag));
  };

  return (
    <>
      <div className="space-y-4">
        {/* Name & Type */}
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight tracking-tight">
            {formatContactName(contact.first_name, contact.last_name)}
          </h1>
          <Badge variant="outline" className={cn('border-0 text-[10px] font-semibold mt-1', typeStyle.className)}>
            {typeStyle.label}
          </Badge>
        </div>

        {/* Pipeline stage */}
        <div className="space-y-2">
          <span className="text-[11px] text-muted-foreground">Pipeline</span>
          <Select value={contact.status ?? 'New Lead'} onValueChange={(v) => saveWithLog('status', v)}>
            <SelectTrigger className="h-9 text-sm bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs gap-1.5 bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
            onClick={() => contact.phone && (window.location.href = `tel:${contact.phone}`)}
            disabled={!contact.phone}
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs gap-1.5 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            onClick={openWhatsApp}
            disabled={!contact.phone}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs gap-1.5 bg-violet-500/10 border-violet-500/20 text-violet-500 hover:bg-violet-500/20"
            onClick={() => setShowEmail(true)}
          >
            <Mail className="w-3.5 h-3.5" /> Email
          </Button>
        </div>

        {/* Insight */}
        <div className="space-y-2">
          <SectionHeader>Insight</SectionHeader>
          <div className="grid grid-cols-3 gap-2">
            <InsightCard
              value={<span style={{ color: leadScore.color }}>{leadScore.score}</span>}
              label="Lead Score"
              sublabel={leadScore.label}
              accent={leadScore.color}
            />
            <InsightCard value={lastTouchLabel} label="Last Touch" />
            <InsightCard value={`${daysInPipeline}d`} label="In Pipeline" />
          </div>
        </div>

        {/* Details */}
        <div className="border-t border-border pt-4 space-y-2">
          <SectionHeader>Details</SectionHeader>
          <div className="space-y-0.5">
            <DetailRow label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} field="phone" contactId={contact.id} />
            <DetailRow label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} field="email" contactId={contact.id} type="email" />
            {contact.email_secondary && <DetailRow label="Email 2" value={contact.email_secondary} field="email_secondary" contactId={contact.id} type="email" />}
            <DetailRow label="Source" value={contact.source} field="source" contactId={contact.id} />
            {((contact as any).sync_source === 'zapier_lofty' || (contact as any).sync_source === 'lofty_api_sync') && (
              <div className="space-y-0.5 py-1.5">
                {(contact as any).lofty_id && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground shrink-0 w-[60px]">Lofty ID</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto font-mono">{(contact as any).lofty_id}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground shrink-0 w-[60px]">Synced</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">
                    {(contact as any).lofty_synced_at ? format(new Date((contact as any).lofty_synced_at), 'MMM d, yyyy h:mm a') : 'via Lofty'}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 py-1.5">
              <span className="text-xs text-muted-foreground shrink-0 w-[60px]">Reg Date</span>
              <span className="text-xs text-foreground ml-auto">{format(new Date(contact.created_at), 'MMM d, yyyy')}</span>
            </div>
            {(contact.budget_min != null || contact.budget_max != null) && (
              <div className="flex items-center gap-3 py-1.5">
                <span className="text-xs text-muted-foreground shrink-0 w-[60px]">Budget</span>
                <span className="text-xs text-foreground ml-auto">
                  {contact.budget_min ? formatCurrency(Number(contact.budget_min)) : '?'} – {contact.budget_max ? formatCurrency(Number(contact.budget_max)) : '?'}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Pipeline</span>
              <Select value={contact.lead_type ?? ''} onValueChange={(v) => saveWithLog('lead_type', v)}>
                <SelectTrigger className="h-8 text-xs bg-card border-border">
                  <SelectValue placeholder="Select pipeline">{LEAD_TYPE_LABELS[contact.lead_type ?? ''] || contact.lead_type || 'Not set'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map(t => <SelectItem key={t} value={t}>{LEAD_TYPE_LABELS[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DetailRow label="City" value={contact.city} field="city" contactId={contact.id} />
            <DetailRow label="Language" value={contact.language} field="language" contactId={contact.id} />
            {contact.bedrooms_preferred && <DetailRow label="Beds" value={contact.bedrooms_preferred} field="bedrooms_preferred" contactId={contact.id} />}
          </div>
        </div>

        {/* Tags - inline like reference */}
        <div className="flex items-start gap-2 py-1">
          <span className="text-xs text-muted-foreground shrink-0 mt-0.5">Tag:</span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {tags.map(tag => (
              <Badge key={tag} className="border-0 text-[10px] font-semibold gap-1 pr-1.5 bg-primary/10 text-primary">
                {tag}
                <X className="w-2.5 h-2.5 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => removeTag(tag)} />
              </Badge>
            ))}
            {!addingTag && (
              <button onClick={() => setAddingTag(true)} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {addingTag && (
          <div className="flex gap-1.5">
            <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Tag name..." className="h-7 text-xs" autoFocus onKeyDown={e => e.key === 'Enter' && addTag()} />
            <Button size="sm" className="h-7 text-xs px-2.5" onClick={addTag}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setAddingTag(false); setNewTag(''); }}>✕</Button>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div className="flex items-start gap-2 py-1">
            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">Project:</span>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {projects.map(p => (
                <Badge key={p} variant="outline" className="border-0 text-[10px] font-semibold bg-primary/10 text-primary">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Co-Buyer / Add Family Member */}
        <div className="border-t border-border pt-4">
          <button onClick={() => setCoBuyerOpen(!coBuyerOpen)} className="flex items-center justify-between w-full">
            <SectionHeader>{hasCoBuyer ? 'Co-Buyer' : 'Family Member'}</SectionHeader>
            {coBuyerOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {coBuyerOpen && (
            <div className="mt-2 space-y-1">
              {hasCoBuyer ? (
                <>
                  <DetailRow label="Name" value={contact.co_buyer_name} field="co_buyer_name" contactId={contact.id} />
                  <DetailRow label="Phone" value={contact.co_buyer_phone} field="co_buyer_phone" contactId={contact.id} />
                  <DetailRow label="Email" value={contact.co_buyer_email} field="co_buyer_email" contactId={contact.id} type="email" />
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground py-1">No co-buyer info</p>
              )}
            </div>
          )}
        </div>

        {/* Assigned To */}
        <div className="border-t border-border pt-4 space-y-2">
          <SectionHeader>Assigned To</SectionHeader>
          <Select value={contact.assigned_to ?? ''} onValueChange={(v) => saveWithLog('assigned_to', v)}>
            <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Select agent" /></SelectTrigger>
            <SelectContent>
              {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Lead Navigation */}
        {navInfo && (
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <button onClick={() => onNavigate('prev')} disabled={navInfo.index <= 0} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums">{navInfo.index + 1} of {navInfo.total}</span>
            <button onClick={() => onNavigate('next')} disabled={navInfo.index >= navInfo.total - 1} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <BookShowingDialog contactId={contact.id} project={contact.project} open={showShowing} onOpenChange={setShowShowing} />
      <CreateTaskDialog contactId={contact.id} assignedTo={contact.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <ComposeEmailDialog contact={contact} open={showEmail} onOpenChange={setShowEmail} />
    </>
  );
}

/* ─── Small reusable pieces ─── */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{children}</h3>;
}

function InsightCard({ value, label, sublabel, accent }: { value: React.ReactNode; label: string; sublabel?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/80 p-2.5 text-center space-y-0.5">
      <p className="text-base font-bold text-foreground leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      {sublabel && <p className="text-[9px] font-medium leading-tight" style={{ color: accent }}>{sublabel}</p>}
    </div>
  );
}

function DetailRow({ label, value, href, field, contactId, type }: {
  label: string; value: string | null | undefined; href?: string; field: string; contactId: string; type?: 'text' | 'email';
}) {
  const updateContact = useUpdateCrmContact();
  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <span className="text-xs text-muted-foreground shrink-0 w-[60px]">{label}</span>
      <div className="flex-1 min-w-0 flex justify-end">
        <InlineEditField
          value={value}
          onSave={(v) => updateContact.mutate({ id: contactId, updates: { [field]: v || null } })}
          href={href}
          type={type}
          className="text-xs text-right truncate max-w-full"
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CENTER COLUMN — Activity Timeline
   ═══════════════════════════════════════════════════ */
type FilterType = 'all' | 'manual' | 'email' | 'call_log' | 'system';

const NOTE_TYPE_META: Record<string, { icon: typeof StickyNote; label: string; color: string }> = {
  manual: { icon: StickyNote, label: 'Note', color: 'text-primary' },
  system: { icon: Zap, label: 'System', color: 'text-muted-foreground' },
  email: { icon: Mail, label: 'Email', color: 'text-violet-500' },
  call_log: { icon: Phone, label: 'Call', color: 'text-emerald-500' },
  import: { icon: Download, label: 'Imported', color: 'text-muted-foreground' },
  zapier: { icon: Zap, label: 'Zapier', color: 'text-orange-500' },
};

function CenterColumn({ contact }: { contact: CrmContact }) {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: notes = [] } = useLeadNotes(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [draft, setDraft] = useState('');
  const [noteType, setNoteType] = useState('manual');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const filteredNotes = useMemo(() => {
    if (filter === 'all') return notes;
    if (filter === 'manual') return notes.filter(n => n.note_type === 'manual' || n.note_type === 'import');
    return notes.filter(n => n.note_type === filter);
  }, [notes, filter]);

  const pinnedNotes = useMemo(() => filteredNotes.filter(n => n.is_pinned), [filteredNotes]);
  const unpinnedNotes = useMemo(() => filteredNotes.filter(n => !n.is_pinned), [filteredNotes]);

  const groupedNotes = useMemo(() => {
    const groups: { label: string; notes: CrmNote[] }[] = [];
    let currentLabel = '';
    unpinnedNotes.forEach(note => {
      const label = getDateGroup(note.created_at);
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
    manual: notes.filter(n => n.note_type === 'manual' || n.note_type === 'import').length,
    email: notes.filter(n => n.note_type === 'email').length,
    call_log: notes.filter(n => n.note_type === 'call_log').length,
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
    { key: 'system', label: 'System' },
  ];

  return (
    <Tabs defaultValue="overview" className="flex flex-col h-full">
      <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 flex-shrink-0">
        <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-5 py-3 font-medium">
          Overview
        </TabsTrigger>
        <TabsTrigger value="showings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-5 py-3 font-medium">
          Showings
          {showings.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-semibold">
              {showings.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 p-5 space-y-5">
        {/* Compose */}
        <div className="bg-card rounded-xl border border-border p-3 space-y-3">
          <div className="flex gap-2">
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger className="w-[100px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Note</SelectItem>
                <SelectItem value="call_log">Call Log</SelectItem>
                <SelectItem value="email">Email Log</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 h-9 text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
              }}
            />
            <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={handleSave} disabled={!draft.trim() || addNote.isPending}>
              <Send className="w-4 h-4" />
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
                'px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                filter === f.key
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
              )}
            >
              {f.label}
              {counts[f.key] > 0 && <span className="ml-1 opacity-60">{counts[f.key]}</span>}
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
                <Pin className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Pinned</span>
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
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
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
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <StickyNote className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add a note, send an email, or book a showing</p>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="showings" className="flex-1 overflow-y-auto mt-0 p-5">
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
  const meta = NOTE_TYPE_META[note.note_type] || NOTE_TYPE_META.manual;
  const Icon = meta.icon;
  const time = format(parseISO(note.created_at), 'h:mm a');

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
      <div className={cn("relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border border-border/60 bg-background", meta.color)}>
        <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
      </div>
      <div className={cn(
        'flex-1 min-w-0 rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm',
        note.is_pinned ? 'border-primary/30 bg-primary/[0.03]' : 'border-border/50',
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/70">{meta.label}</span>
            <span className="opacity-40">·</span>
            <span>{time}</span>
            {note.is_pinned && <Pin className="w-3 h-3 text-primary" />}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => updateNote.mutate({ id: note.id, contactId, updates: { is_pinned: !note.is_pinned } })} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
              {note.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
            {isOwn && (
              <>
                <button onClick={() => onSetEditing(note.id, note.content)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
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
        <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-2 leading-relaxed">{note.content}</p>
      </div>
    </div>
  );
}

/* Showings tab */
function ShowingsTab({ contactId, showings }: { contactId: string; showings: any[] }) {
  const [showBooking, setShowBooking] = useState(false);

  const statusColor: Record<string, string> = {
    confirmed: 'bg-emerald-500/15 text-emerald-600',
    cancelled: 'bg-destructive/15 text-destructive',
    completed: 'bg-primary/15 text-primary',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Showings</h3>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowBooking(true)}>
          <Plus className="w-3.5 h-3.5" /> Book Showing
        </Button>
      </div>
      {showings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No showings yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Book a showing to track property visits</p>
        </div>
      ) : (
        <div className="space-y-2">
          {showings.map((s: any) => (
            <div key={s.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.project}{s.unit ? ` — ${s.unit}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(s.showing_date), 'MMM d, yyyy')} at {s.showing_time}</p>
                {s.notes && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{s.notes}</p>}
              </div>
              <Badge variant="outline" className={cn('text-[10px] border-0 font-semibold', statusColor[s.status] ?? 'bg-muted text-muted-foreground')}>
                {s.status ?? 'Confirmed'}
              </Badge>
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
function RightSidebar({ contact }: { contact: CrmContact }) {
  const { data: tasks = [] } = useCrmContactTasks(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const { data: emails, isLoading: emailsLoading } = useCrmEmailLog(contact.id);
  const [showTask, setShowTask] = useState(false);
  const [showShowing, setShowShowing] = useState(false);

  const now = new Date();
  const pendingTasks = tasks.filter((t: any) => t.status !== 'completed');
  const upcomingShowings = showings
    .filter((s: any) => new Date(s.showing_date) >= now && s.status !== 'cancelled')
    .sort((a: any, b: any) => new Date(a.showing_date).getTime() - new Date(b.showing_date).getTime());

  return (
    <>
      <div className="space-y-5">
        {/* Tasks */}
        <WidgetSection title="Tasks" count={pendingTasks.length} onAdd={() => setShowTask(true)}>
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
        <WidgetSection title="Appointments" count={upcomingShowings.length} onAdd={() => setShowShowing(true)}>
          {upcomingShowings.length === 0 ? (
            <EmptyWidget icon={Calendar} message="No upcoming appointments" />
          ) : (
            <div className="space-y-1.5">
              {upcomingShowings.slice(0, 5).map((s: any) => (
                <div key={s.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-card border border-border/50 hover:border-border transition-colors">
                  <div className="w-7 h-7 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.project}</p>
                    <p className="text-[11px] text-muted-foreground">{format(new Date(s.showing_date), 'MMM d')} · {s.showing_time}</p>
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
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : !emails || emails.length === 0 ? (
            <EmptyWidget icon={Mail} message="No email activity" />
          ) : (
            <div className="space-y-1.5">
              {emails.slice(0, 5).map((email: any) => (
                <div key={email.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-card border border-border/50 hover:border-border transition-colors">
                  <div className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                    email.direction === 'outbound' ? 'bg-primary/10' : 'bg-emerald-500/10'
                  )}>
                    {email.direction === 'outbound'
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                      : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{email.subject}</p>
                    <p className="text-[11px] text-muted-foreground">{format(new Date(email.sent_at), 'MMM d · h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetSection>
      </div>

      <CreateTaskDialog contactId={contact.id} assignedTo={contact.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <BookShowingDialog contactId={contact.id} project={contact.project} open={showShowing} onOpenChange={setShowShowing} />
    </>
  );
}

/* Widget helpers */
function WidgetSection({ title, count, onAdd, children }: { title: string; count?: number; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SectionHeader>{title}</SectionHeader>
          {count != null && count > 0 && (
            <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-semibold">{count}</span>
          )}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="text-muted-foreground hover:text-foreground transition-colors">
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
    <div className="flex items-center gap-2.5 py-4 justify-center">
      <Icon className="w-4 h-4 text-muted-foreground/50" />
      <span className="text-xs text-muted-foreground/70">{message}</span>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
  return (
    <div className={cn(
      'flex items-start gap-2.5 p-2.5 rounded-lg bg-card border transition-colors',
      isOverdue ? 'border-destructive/30' : 'border-border/50 hover:border-border'
    )}>
      <Checkbox className="mt-0.5 h-3.5 w-3.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{task.title}</p>
        {task.due_date && (
          <p className={cn('text-[11px] mt-0.5', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {isOverdue ? 'Overdue · ' : ''}{format(new Date(task.due_date), 'MMM d, yyyy')}
          </p>
        )}
      </div>
      {task.priority === 'high' && (
        <span className="text-[10px] text-destructive font-semibold bg-destructive/10 px-1.5 py-0.5 rounded">High</span>
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
        <div className="px-4 py-2.5 border-b border-border bg-background flex-shrink-0">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[280px] flex-shrink-0 border-r border-border bg-muted/20 p-4 space-y-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0 p-5 space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                  <Skeleton className="h-20 flex-1 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
          <div className="w-[300px] flex-shrink-0 border-l border-border bg-muted/20 p-4 space-y-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-4 w-20 mt-4" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">Lead not found.</p>
        <Link to="/crm/leads" className="text-sm text-primary hover:underline">← Back to Leads</Link>
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="space-y-4 pb-6">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <LeftSidebar contact={contact as CrmContact} leadScore={leadScore} lastTouchLabel={lastTouchLabel} daysInPipeline={daysInPipeline} navInfo={navInfo} onNavigate={handleNavigate} />
        </div>
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden" style={{ minHeight: 400 }}>
          <CenterColumn contact={contact as CrmContact} />
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <RightSidebar contact={contact as CrmContact} />
        </div>
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Back bar */}
      <div className="px-5 py-2.5 border-b border-border bg-background flex-shrink-0 flex items-center justify-between">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
      </div>

      {/* 3 columns */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-[280px] flex-shrink-0 border-r border-border bg-muted/20 overflow-y-auto p-4">
          <LeftSidebar contact={contact as CrmContact} leadScore={leadScore} lastTouchLabel={lastTouchLabel} daysInPipeline={daysInPipeline} navInfo={navInfo} onNavigate={handleNavigate} />
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          <CenterColumn contact={contact as CrmContact} />
        </div>

        {/* Right sidebar */}
        <div className="w-[300px] flex-shrink-0 border-l border-border bg-muted/20 overflow-y-auto p-4">
          <RightSidebar contact={contact as CrmContact} />
        </div>
      </div>
    </div>
  );
}
