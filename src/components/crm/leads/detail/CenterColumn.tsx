import { useMemo, useState } from 'react';
import { StickyNote, Sparkles, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useCrmContactShowings } from '@/hooks/useCrmLeadDetail';
import { useLeadNotes, useAddNote, useUpdateNote, type CrmNote } from '@/hooks/useCrmNotes';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog, type CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';
import { useCrmContactActivityEvents } from '@/hooks/useCrmLeadCommunications';
import { QuickActionBar } from '@/components/crm/leads/QuickActionBar';
import { EmailNoteCard } from '@/components/crm/leads/EmailNoteCard';
import { EmailPreviewDialog, type EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import { LeadEmailThreadDialog } from '@/components/crm/leads/LeadEmailThreadDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SmsNoteCard } from '@/components/crm/leads/SmsNoteCard';
import { SmsThreadDrawer } from '@/components/crm/leads/SmsThreadDrawer';
import { useOpenChat } from '@/hooks/useOpenChat';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { getDateGroup, noteTime, type CrmShowing } from './types';
import { NoteCard } from './NoteCard';
import { ShowingsTab } from './ShowingsTab';
import { AiSummaryCard, GenerateAiSummaryButton } from './AiSummaryCard';
import { SystemActivityCluster, isSystemishNote } from './SystemActivityCluster';
import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const { data: activityEvents = [] } = useCrmContactActivityEvents(contact.id);
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const openChat = useOpenChat();

  const [smsDrawerOpen, setSmsDrawerOpen] = useState(false);
  const [smsDrawerChannel, setSmsDrawerChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [smsDrawerInitialId, setSmsDrawerInitialId] = useState<string | null>(null);

  const openSmsThread = (row: CrmSmsLogRow) => {
    setSmsDrawerChannel(row.channel === 'whatsapp' ? 'whatsapp' : 'sms');
    setSmsDrawerInitialId(row.id);
    setSmsDrawerOpen(true);
  };

  const replyFromSmsDrawer = () => {
    setSmsDrawerOpen(false);
    openChat(contact.id, smsDrawerChannel, onText);
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

    // Synthesize virtual notes from external activity events (Presale webhook,
    // email opens, deck visits, lead.approved, etc.). These live in
    // crm_activity_events and are NOT in our emailLog / smsLog tables, so
    // without this merge they'd never appear in the timeline.
    const eventNotes: CrmNote[] = [];
    for (const ev of (activityEvents ?? []) as any[]) {
      const t: string = ev.type || 'event';
      const meta = ev.metadata || {};
      const subject = meta.subject ? `: ${meta.subject}` : '';

      // Presale-pushed outbound emails (auto-responses, project sends) include
      // a fully rendered body_html. Fold them into the email lane so they
      // render with the polished EmailNoteCard + open in the email preview.
      const isPresaleEmailSend =
        (t === 'email.sent' ||
          t === 'email.auto_response_sent' ||
          t === 'email_sent' ||
          t === 'email_auto_response_sent') &&
        (meta.body_html || meta.subject);
      if (isPresaleEmailSend) {
        const noteId = `presale-email-${ev.id}`;
        const ts = ev.occurred_at || meta.sent_at || ev.received_at || new Date().toISOString();
        const virtualRow: EmailLogRow = {
          id: ev.id,
          subject: meta.subject ?? null,
          body: meta.body_html ?? null,
          body_html: meta.body_html ?? null,
          body_text: meta.body_text ?? null,
          direction: (meta.direction === 'inbound' ? 'inbound' : 'outbound'),
          sent_at: meta.sent_at ?? ts,
          created_at: ts,
          from_email: meta.from_email ?? null,
          to_email: meta.to_email ?? null,
          open_count: meta.open_count ?? 0,
          click_count: meta.click_count ?? 0,
          tracking_id: meta.tracking_id ?? null,
          sent_by: null,
        };
        emailMap.set(noteId, virtualRow);
        eventNotes.push({
          id: noteId,
          contact_id: contact.id,
          user_id: '',
          content: `Sent email: ${meta.subject ?? '(no subject)'}`,
          note_type: 'email',
          is_pinned: false,
          created_at: ts,
          updated_at: ts,
          event_at: ts,
        });
        continue;
      }

      let kind: CrmNote['note_type'] = 'system';
      let label = t;
      if (t === 'email_opened' || t === 'email.opened') {
        kind = 'email';
        const n = meta.open_count ? ` (open #${meta.open_count})` : '';
        label = `Email opened${n}${subject}`;
      } else if (t === 'email.clicked' || t === 'email_clicked' || t === 'email_link_clicked') {
        kind = 'email';
        label = `Email link clicked${subject}`;
      } else if (t === 'lead.approved') {
        kind = 'system';
        label = `Lead approved${meta.approved_by ? ` by ${meta.approved_by}` : ''}${meta.project_name ? ` — ${meta.project_name}` : ''}`;
      } else if (t.startsWith('deck')) {
        kind = 'system';
        label = `Deck visit${meta.visit_number ? ` #${meta.visit_number}` : ''}${meta.project_name ? ` — ${meta.project_name}` : ''}`;
      } else if (t === 'floorplan_download' || t === 'floorplan.downloaded') {
        kind = 'system';
        label = `Floorplan downloaded${meta.project_name ? ` — ${meta.project_name}` : ''}`;
      } else {
        label = t.replace(/[._]/g, ' ');
      }
      eventNotes.push({
        id: `evt-${ev.id}`,
        contact_id: contact.id,
        user_id: '',
        content: label,
        note_type: kind,
        is_pinned: false,
        created_at: ev.occurred_at || ev.received_at || new Date().toISOString(),
        updated_at: ev.occurred_at || ev.received_at || new Date().toISOString(),
        event_at: ev.occurred_at || ev.received_at || null,
      });
    }

    const merged = [...rawNotes, ...emailNotes, ...smsNotes, ...eventNotes];
    const ts = (n: CrmNote) => new Date(n.event_at || n.created_at).getTime();
    const sorted = merged.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return ts(b) - ts(a);
    });
    return { notes: sorted, emailById: emailMap, smsById: smsMap };
  }, [rawNotes, emailLog, smsLog, activityEvents, contact.id]);

  const [previewEmail, setPreviewEmail] = useState<EmailLogRow | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [threadInitialId, setThreadInitialId] = useState<string | null>(null);
  const [replyCompose, setReplyCompose] = useState<{ subject: string; bodyHtml: string } | null>(null);

  const handleReplyToPreview = (em: EmailLogRow) => {
    if (!contact.email) {
      toast.error('Add an email to this lead before replying');
      return;
    }
    const cleanSubject = (em.subject || '').replace(/^(re:\s*)+/i, '').trim();
    const subject = cleanSubject ? `Re: ${cleanSubject}` : 'Re:';
    const ts = em.sent_at || em.created_at;
    const dateLabel = ts ? new Date(ts).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }) : '';
    const fromAddr = em.from_email || 'sender';
    const fromName = (em as any).from_name || (fromAddr.includes('@') ? fromAddr.split('@')[0] : fromAddr);
    const toAddr = contact.email || '';
    let rawBody = (em.body_html || em.body || em.body_text || '').toString();

    // Strip the original sender's signature/legal-disclaimer trailer so the
    // quoted block focuses on the actual message. The Presale auto-emails
    // always end with the same "LEGAL DISCLAIMER" block + agent v-card; cut
    // everything from there so the reply view stays tight.
    rawBody = rawBody
      .replace(/<hr[^>]*>[\s\S]*$/i, '')
      .replace(/(LEGAL\s*DISCLAIMER)[\s\S]*$/i, '')
      .replace(/(<table[^>]*>[\s\S]*?(PREC|REAL\s*BROKER|FOUNDER\s*&amp;\s*PRESALE)[\s\S]*?<\/table>)/gi, '')
      .trim();

    // Gmail-style reply: 2 blank paragraphs (cursor lands here), then a
    // hairline divider, a faint attribution line, then the original body
    // inside a styled blockquote that visually reads as "previous message".
    const attribution = `On ${dateLabel}${fromName ? `, <strong>${fromName}</strong>` : ''}${fromAddr && fromAddr !== fromName ? ` &lt;${fromAddr}&gt;` : ''} wrote${toAddr ? ` to ${toAddr}` : ''}:`;
    const quoted = rawBody
      ? `<blockquote style="margin:0;padding:12px 16px;border-left:3px solid #d7a542;background:#faf7f0;color:#374151;font-size:14px;line-height:1.55;border-radius:0 6px 6px 0">${rawBody}</blockquote>`
      : '';
    const bodyHtml =
      `<p><br/></p>` +
      `<p><br/></p>` +
      `<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0" />` +
      `<p style="color:#6b7280;font-size:12px;margin:0 0 10px;font-style:italic">${attribution}</p>` +
      quoted;
    setReplyCompose({ subject, bodyHtml });
  };

  const handleOpenEmail = (noteId: string) => {
    const row = emailById.get(noteId);
    if (!row) return;
    // Presale-pushed emails (synthesized from crm_activity_events) aren't in
    // the local crm_email_log, so the thread dialog can't load them. Open the
    // single-message preview directly so the body_html renders cleanly.
    if (noteId.startsWith('presale-email-')) {
      setPreviewEmail(row);
      setThreadInitialId(null);
      setThreadOpen(false);
      return;
    }
    // Open the full-thread dialog scoped to this email so the agent sees
    // the complete back-and-forth with quoted history + inline reply.
    setThreadInitialId(`log-${row.id}`);
    setThreadOpen(true);
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

      {/* Inner tab strip removed — Appointments now lives as a collapsible card
          inside the Activity feed (see below) so the activity content can rise to
          the top of the column without a redundant tab bar above it. */}

      <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 px-0 py-2.5 md:p-6 space-y-2.5 md:space-y-5">
        <div className="px-3 md:px-0">
          <QuickActionBar contact={contact} />
        </div>

        <div className="px-3 md:px-0 space-y-3">
          {/* Toolbar: filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10.5px] font-medium leading-none transition-colors border inline-flex items-center',
                  filter === f.key
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50',
                )}
              >
                {f.label}
                {(counts as any)[f.key] > 0 && (
                  <span className="ml-1 text-[10px] opacity-70">{(counts as any)[f.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Notes feed */}
          <div className="relative space-y-1">
            {(pinnedNotes.length > 0 || groupedNotes.length > 0) && (
              <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border/50" />
            )}

            {/* Pinned section */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-1.5 pl-9">
                  <Pin className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Pinned</span>
                </div>
                {pinnedNotes.map(note => {
                  const emailRow = emailById.get(note.id);
                  const smsRow = smsById.get(note.id);
                  if (note.note_type === 'ai_summary') {
                    const stale = (contact as any).ai_summary_stale === true;
                    return (
                      <AiSummaryCard
                        key={note.id}
                        note={note}
                        contactId={contact.id}
                        isStale={stale}
                      />
                    );
                  }
                  if (emailRow) {
                    return (
                      <EmailNoteCard
                        key={note.id}
                        email={emailRow}
                        contactEmail={contact.email}
                        onOpen={() => handleOpenEmail(note.id)}
                      />
                    );
                  }
                  if (smsRow) {
                    return (
                      <SmsNoteCard
                        key={note.id}
                        message={smsRow}
                        onOpen={() => openSmsThread(smsRow)}
                      />
                    );
                  }
                  return (
                    <NoteCard
                      key={note.id}
                      note={note}
                      isOwn={note.user_id === currentUserId}
                      contactId={contact.id}
                      editingId={editingId}
                      editContent={editContent}
                      onSetEditing={(id, c) => { setEditingId(id); setEditContent(c); }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={handleEditSave}
                      setEditContent={setEditContent}
                    />
                  );
                })}
              </div>
            )}

            {/* Grouped by date */}
            {groupedNotes.map(group => (
              <div key={group.label} className="space-y-2 mb-4">
                <div className="pl-9">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
                {(() => {
                  // Walk the date-group and collapse consecutive system-style
                  // notes (lead score updates, task created/completed,
                  // automation writes) into a single SystemActivityCluster row.
                  const out: React.ReactNode[] = [];
                  let runStart = -1;
                  for (let i = 0; i <= group.notes.length; i++) {
                    const note = group.notes[i];
                    const isSys = note ? isSystemishNote(note) : false;
                    if (isSys) {
                      if (runStart === -1) runStart = i;
                      continue;
                    }
                    // Flush any pending system run.
                    if (runStart !== -1) {
                      const run = group.notes.slice(runStart, i);
                      out.push(
                        <SystemActivityCluster
                          key={`syscluster-${run[0].id}`}
                          notes={run}
                        />,
                      );
                      runStart = -1;
                    }
                    if (!note) break;
                    const emailRow = emailById.get(note.id);
                    const smsRow = smsById.get(note.id);
                    if (emailRow) {
                      out.push(
                        <EmailNoteCard
                          key={note.id}
                          email={emailRow}
                          contactEmail={contact.email}
                          onOpen={() => handleOpenEmail(note.id)}
                        />,
                      );
                    } else if (smsRow) {
                      out.push(
                        <SmsNoteCard
                          key={note.id}
                          message={smsRow}
                          onOpen={() => openSmsThread(smsRow)}
                        />,
                      );
                    } else {
                      out.push(
                        <NoteCard
                          key={note.id}
                          note={note}
                          isOwn={note.user_id === currentUserId}
                          contactId={contact.id}
                          editingId={editingId}
                          editContent={editContent}
                          onSetEditing={(id, c) => { setEditingId(id); setEditContent(c); }}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={handleEditSave}
                          setEditContent={setEditContent}
                        />,
                      );
                    }
                  }
                  return out;
                })()}
              </div>
            ))}

            {filteredNotes.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {filter === 'all' ? 'No notes or activity yet.' : `No ${filter} entries yet.`}
              </p>
            )}
          </div>
        </div>

        {/* Appointments — collapsible card */}
        {showings.length > 0 && (
          <details className="mt-4 mx-4 md:mx-0 group rounded-xl border border-border bg-card/50 overflow-hidden">
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

      {/* (Standalone Showings TabsContent removed — accordion above is the single surface.) */}

      <LeadEmailThreadDialog
        contact={contact}
        open={threadOpen}
        onOpenChange={(o) => {
          setThreadOpen(o);
          if (!o) setThreadInitialId(null);
        }}
        initialEmailId={threadInitialId}
      />

      {/* Standalone preview for emails that aren't in crm_email_log
          (e.g. Presale-pushed auto-responses with rendered body_html). */}
      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => { if (!o) setPreviewEmail(null); }}
        contactEmail={contact.email}
        onReply={handleReplyToPreview}
      />

      {/* Compose dialog launched from the preview's Reply button. */}
      <ComposeEmailDialog
        contact={contact}
        open={!!replyCompose}
        onOpenChange={(o) => { if (!o) setReplyCompose(null); }}
        initialSubject={replyCompose?.subject}
        initialBodyHtml={replyCompose?.bodyHtml}
      />

      <ImportConversationDialog
        contact={contact}
        open={showImport}
        onOpenChange={setShowImport}
      />

      <SmsThreadDrawer
        open={smsDrawerOpen}
        onOpenChange={(o) => { setSmsDrawerOpen(o); if (!o) setSmsDrawerInitialId(null); }}
        contact={contact}
        messages={smsLog}
        channel={smsDrawerChannel}
        initialMessageId={smsDrawerInitialId}
        onReply={replyFromSmsDrawer}
      />
    </Tabs>
  );
}

