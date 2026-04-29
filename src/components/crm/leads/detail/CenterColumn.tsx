import { useMemo, useState } from 'react';
import { StickyNote, Sparkles } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useCrmContactShowings } from '@/hooks/useCrmLeadDetail';
import { useLeadNotes, useAddNote, useUpdateNote, type CrmNote } from '@/hooks/useCrmNotes';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog, type CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';
import { QuickActionBar } from '@/components/crm/leads/QuickActionBar';
import { ImportConversationDialog } from '@/components/crm/leads/ImportConversationDialog';
import { EmailNoteCard } from '@/components/crm/leads/EmailNoteCard';
import { EmailPreviewDialog, type EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import { LeadEmailThreadDialog } from '@/components/crm/leads/LeadEmailThreadDialog';
import { SmsNoteCard } from '@/components/crm/leads/SmsNoteCard';
import { useOpenChat } from '@/hooks/useOpenChat';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { getDateGroup, noteTime, type CrmShowing } from './types';
import { NoteCard } from './NoteCard';
import { ShowingsTab } from './ShowingsTab';
import { AiSummaryCard, GenerateAiSummaryButton } from './AiSummaryCard';

type FilterType = 'all' | 'manual' | 'email' | 'sms' | 'call_log' | 'web' | 'system';

interface Props {
  contact: CrmContact;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onTask: () => void;
  onShowing: () => void;
}

export function CenterColumn({ contact, onCall, onText, onEmail, onTask, onShowing }: Props) {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: rawNotes = [] } = useLeadNotes(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const { data: emailLog = [] } = useCrmEmailLog(contact.id);
  const { data: smsLog = [] } = useCrmContactSmsLog(contact.id);
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const openChat = useOpenChat();

  const openSmsThread = (row: CrmSmsLogRow) => {
    const channel = row.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    openChat(contact.id, channel, onText);
  };

  // Merge real notes with virtual entries synthesized from the email + SMS
  // logs so every channel shows up in the central activity timeline.
  const { notes, emailById, smsById } = useMemo(() => {
    const emailMap = new Map<string, EmailLogRow>();
    const smsMap = new Map<string, CrmSmsLogRow>();

    const emailNotes: CrmNote[] = (emailLog ?? []).map((e: EmailLogRow & { sent_by?: string | null }) => {
      const direction = e.direction === 'inbound' ? 'Received' : 'Sent';
      const subject = e.subject || '(no subject)';
      const noteId = `email-${e.id}`;
      emailMap.set(noteId, e);
      return {
        id: noteId,
        contact_id: contact.id,
        user_id: e.sent_by || '',
        content: `${direction} email: ${subject}`,
        note_type: 'email',
        is_pinned: false,
        created_at: e.sent_at || e.created_at || new Date().toISOString(),
        updated_at: e.sent_at || e.created_at || new Date().toISOString(),
        event_at: e.sent_at || e.created_at || null,
      };
    });

    const smsNotes: CrmNote[] = (smsLog ?? []).map((s) => {
      const noteId = `sms-${s.id}`;
      smsMap.set(noteId, s);
      const channelLabel = s.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
      const directionLabel = s.direction === 'inbound' ? 'Received' : 'Sent';
      const preview = (s.body ?? '').slice(0, 80) || '(no body)';
      return {
        id: noteId,
        contact_id: contact.id,
        user_id: s.user_id || '',
        content: `${directionLabel} ${channelLabel}: ${preview}`,
        note_type: 'sms',
        is_pinned: false,
        created_at: s.sent_at || s.created_at,
        updated_at: s.sent_at || s.created_at,
        event_at: s.sent_at || s.created_at,
      };
    });

    const merged = [...rawNotes, ...emailNotes, ...smsNotes];
    const ts = (n: CrmNote) => new Date(n.event_at || n.created_at).getTime();
    const sorted = merged.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return ts(b) - ts(a);
    });
    return { notes: sorted, emailById: emailMap, smsById: smsMap };
  }, [rawNotes, emailLog, smsLog, contact.id]);

  const [previewEmail, setPreviewEmail] = useState<EmailLogRow | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [threadInitialId, setThreadInitialId] = useState<string | null>(null);
  const handleOpenEmail = (noteId: string) => {
    const row = emailById.get(noteId);
    if (!row) return;
    // Open the full-thread dialog scoped to this email so the agent sees
    // the complete back-and-forth with quoted history + inline reply.
    setThreadInitialId(`log-${row.id}`);
    setThreadOpen(true);
    // Keep the legacy preview state available but unused; future single-row
    // previews can re-enable this without code changes.
    setPreviewEmail(null);
  };

  const [draft, setDraft] = useState('');
  const [noteType] = useState('manual');
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
    sms: notes.filter(n => n.note_type === 'sms').length,
    call_log: notes.filter(n => n.note_type === 'call_log').length,
    web: notes.filter(isWebActivity).length,
    system: notes.filter(n => n.note_type === 'system').length,
  }), [notes]);

  // unused but kept for parity with prior behavior; ignoreable
  void draft; void setDraft; void noteType; void addNote;

  const handleEditSave = (noteId: string) => {
    if (!editContent.trim()) return;
    updateNote.mutate({ id: noteId, contactId: contact.id, updates: { content: editContent.trim() } });
    setEditingId(null);
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'manual', label: 'Notes' },
    { key: 'email', label: 'Emails' },
    { key: 'sms', label: 'Texts' },
    { key: 'call_log', label: 'Calls' },
    { key: 'web', label: 'Web' },
    { key: 'system', label: 'System' },
  ];

  return (
    <Tabs defaultValue="overview" className="flex flex-col h-full">

      {/* Inner tab strip — desktop only. On mobile the parent already has Details/Activity/Insights tabs. */}
      <TabsList className="hidden md:flex w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 flex-shrink-0 px-5">
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

      <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 px-0 py-3 md:p-6 space-y-3 md:space-y-5">
        <div className="px-4 md:px-0">
          <QuickActionBar contact={contact} />
        </div>

        {/* Filter strip — single horizontal scroll row on mobile, wrap on desktop */}
        <div className="px-4 md:px-0 overflow-x-auto md:overflow-visible scrollbar-none">
          <div className="flex items-center gap-1.5 md:flex-wrap min-w-max md:min-w-0">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-[11px] md:text-xs font-semibold transition-all uppercase tracking-[0.08em]',
                  filter === f.key
                    ? 'bg-foreground text-background'
                    : 'bg-muted/40 md:bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {f.label}
                {counts[f.key] > 0 && <span className="ml-1.5 opacity-60 normal-case tracking-normal tabular-nums">{counts[f.key]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="relative space-y-1.5 px-4 md:px-0">
          {(pinnedNotes.length > 0 || groupedNotes.length > 0) && (
            <div className="hidden md:block absolute left-[13px] top-4 bottom-4 w-px bg-border/40" />
          )}

          {pinnedNotes.length === 0 && (
            <div className="mb-4 md:mb-5 md:pl-9">
              <GenerateAiSummaryButton contactId={contact.id} hasExisting={false} />
            </div>
          )}

          {pinnedNotes.length > 0 && (
            <div className="space-y-2 mb-4 md:mb-5">
              <div className="flex items-center gap-1.5 md:pl-9">
                <span className="text-[10.5px] md:text-[11px] font-semibold text-foreground/70 uppercase tracking-[0.12em]">Pinned</span>
              </div>
              {pinnedNotes.map(note => {
                if (note.note_type === 'ai_summary') {
                  return (
                    <AiSummaryCard
                      key={note.id}
                      note={note}
                      contactId={contact.id}
                      isStale={(contact as any).ai_summary_stale}
                    />
                  );
                }
                const emailRow = note.id.startsWith('email-') ? emailById.get(note.id) : null;
                if (emailRow) {
                  return (
                    <EmailNoteCard
                      key={note.id}
                      email={emailRow}
                      contactEmail={contact.email}
                      onOpen={() => setPreviewEmail(emailRow)}
                    />
                  );
                }
                const smsRow = note.id.startsWith('sms-') ? smsById.get(note.id) : null;
                if (smsRow) {
                  return <SmsNoteCard key={note.id} message={smsRow} onOpen={() => openSmsThread(smsRow)} />;
                }
                return (
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
                    onOpenEmail={handleOpenEmail}
                  />
                );
              })}
            </div>
          )}

          {groupedNotes.map(group => (
            <div key={group.label} className="space-y-2 mb-4 md:mb-5">
              {/* Sticky day divider on mobile so users always know where they are */}
              <div className="md:pl-9 sticky top-0 md:static z-10 bg-background/95 md:bg-transparent backdrop-blur md:backdrop-blur-none -mx-4 md:mx-0 px-4 md:px-0 py-1 md:py-0 border-b md:border-b-0 border-border/40">
                <span className="text-[10.5px] md:text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">{group.label}</span>
              </div>
              {group.notes.map(note => {
                const emailRow = note.id.startsWith('email-') ? emailById.get(note.id) : null;
                if (emailRow) {
                  return (
                    <EmailNoteCard
                      key={note.id}
                      email={emailRow}
                      contactEmail={contact.email}
                      onOpen={() => setPreviewEmail(emailRow)}
                    />
                  );
                }
                const smsRow = note.id.startsWith('sms-') ? smsById.get(note.id) : null;
                if (smsRow) {
                  return <SmsNoteCard key={note.id} message={smsRow} onOpen={() => openSmsThread(smsRow)} />;
                }
                return (
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
                    onOpenEmail={handleOpenEmail}
                  />
                );
              })}
            </div>
          ))}

          {filteredNotes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center">
              <div className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center mb-3">
                <StickyNote className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground/80">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a note above to get started</p>
            </div>
          )}
        </div>

        {/* Mobile-only Appointments accordion — replaces the desktop inner tab */}
        {showings.length > 0 && (
          <details className="md:hidden mt-4 mx-4 md:mx-0 group rounded-xl border border-border bg-card/50 overflow-hidden">
            <summary className="list-none cursor-pointer flex items-center justify-between px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
              <span className="flex items-center gap-2">
                Appointments
                <span className="text-[10.5px] bg-muted text-foreground/80 rounded-full px-2 py-0.5 font-semibold normal-case tracking-normal tabular-nums">
                  {showings.length}
                </span>
              </span>
              <span className="text-muted-foreground text-[18px] leading-none group-open:rotate-45 transition-transform">+</span>
            </summary>
            <div className="border-t border-border p-3">
              <ShowingsTab contactId={contact.id} showings={showings as CrmShowing[]} />
            </div>
          </details>
        )}
      </TabsContent>

      <TabsContent value="showings" className="flex-1 overflow-y-auto mt-0 p-3 md:p-6">
        <ShowingsTab contactId={contact.id} showings={showings as CrmShowing[]} />
      </TabsContent>

      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => !o && setPreviewEmail(null)}
        contactEmail={contact.email}
      />

      <LeadEmailThreadDialog
        contact={contact}
        open={threadOpen}
        onOpenChange={(o) => { setThreadOpen(o); if (!o) setThreadInitialId(null); }}
        initialEmailId={threadInitialId}
      />
    </Tabs>
  );
}

