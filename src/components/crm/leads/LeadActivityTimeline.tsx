import { useState, useMemo } from 'react';
import {
  MessageCircle, Mail, CalendarDays, CheckCircle, StickyNote, Send,
  MailOpen, MousePointerClick, FileText, Eye, Phone, MessageSquare, ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday, parseISO, isThisWeek, isThisYear } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useCrmContactMessages, useCrmContactShowings, useCrmContactTasks, useAddCrmMessage,
  useCrmContact,
} from '@/hooks/useCrmLeadDetail';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog } from '@/hooks/useCrmContactSmsLog';
import {
  useCrmContactForms,
  useCrmContactEngagement,
  useCrmContactActivityEvents,
} from '@/hooks/useCrmLeadCommunications';
import { EmailPreviewDialog, type EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import { cn } from '@/lib/utils';

type Kind = 'email' | 'sms' | 'engagement' | 'form' | 'showing' | 'task' | 'note' | 'system';

interface TimelineEntry {
  id: string;
  kind: Kind;
  icon: typeof MessageCircle;
  /** Tailwind color classes for the icon chip — text + bg */
  tone: { text: string; bg: string; ring: string; chip: string };
  direction?: 'in' | 'out' | null;
  title: string;
  subtitle?: string;
  detail?: string;
  time: Date;
  badges?: string[];
  onClick?: () => void;
}

const TONES: Record<Kind, TimelineEntry['tone']> = {
  email:      { text: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-500/10',     ring: 'ring-blue-500/20',     chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  sms:        { text: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-500/10',      ring: 'ring-sky-500/20',      chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  engagement: { text: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-500/10', ring: 'ring-fuchsia-500/20', chip: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' },
  form:       { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  showing:    { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10',   ring: 'ring-violet-500/20',   chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  task:       { text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/10',    ring: 'ring-amber-500/20',    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  note:       { text: 'text-foreground',                       bg: 'bg-muted',           ring: 'ring-border',          chip: 'bg-muted text-foreground/70' },
  system:     { text: 'text-muted-foreground',                 bg: 'bg-muted/60',        ring: 'ring-border',          chip: 'bg-muted text-muted-foreground' },
};

const KIND_LABEL: Record<Kind, string> = {
  email: 'Email', sms: 'SMS', engagement: 'Engagement',
  form: 'Form', showing: 'Showing', task: 'Task', note: 'Note', system: 'System',
};

const KIND_FILTERS: { key: 'all' | Kind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'email', label: 'Emails' },
  { key: 'sms', label: 'SMS' },
  { key: 'engagement', label: 'Opens · Clicks' },
  { key: 'form', label: 'Forms' },
  { key: 'showing', label: 'Showings' },
  { key: 'task', label: 'Tasks' },
  { key: 'note', label: 'Notes' },
];

function dateGroup(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, 'EEEE');
  if (isThisYear(d)) return format(d, 'MMMM d');
  return format(d, 'MMM d, yyyy');
}

function clamp(s?: string | null, n = 160) {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function LeadActivityTimeline({ contactId }: { contactId: string }) {
  const { data: contact } = useCrmContact(contactId);
  const email = (contact as any)?.email ?? null;

  const { data: messages = [] } = useCrmContactMessages(contactId);
  const { data: showings = [] } = useCrmContactShowings(contactId);
  const { data: tasks = [] } = useCrmContactTasks(contactId);
  const { data: emails = [] } = useCrmEmailLog(contactId);
  const { data: smsRows = [] } = useCrmContactSmsLog(contactId);
  const { data: forms = [] } = useCrmContactForms(contactId, email);
  const { data: engagement = [] } = useCrmContactEngagement(contactId, email);
  const { data: activityEvents = [] } = useCrmContactActivityEvents(contactId);
  const addMessage = useAddCrmMessage();

  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [previewEmail, setPreviewEmail] = useState<EmailLogRow | null>(null);

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    // crm_messages — calls + chat-style notes
    messages.forEach((m: any) => {
      const ch = String(m.channel ?? 'message').toLowerCase();
      const isCall = ch === 'call' || m.message_type === 'call';
      const isNote = ch === 'note' || m.message_type === 'note';
      const dir: 'in' | 'out' = m.direction === 'inbound' ? 'in' : 'out';
      if (isNote) {
        entries.push({
          id: `msg-${m.id}`,
          kind: 'note',
          icon: StickyNote,
          tone: TONES.note,
          title: 'Note',
          detail: clamp(m.content),
          time: new Date(m.created_at),
        });
      } else if (isCall) {
        entries.push({
          id: `msg-${m.id}`,
          kind: 'task',
          icon: Phone,
          tone: TONES.task,
          direction: dir,
          title: dir === 'in' ? 'Call received' : 'Call logged',
          detail: clamp(m.content),
          time: new Date(m.created_at),
        });
      } else {
        entries.push({
          id: `msg-${m.id}`,
          kind: 'sms',
          icon: ch === 'whatsapp' ? MessageCircle : MessageSquare,
          tone: TONES.sms,
          direction: dir,
          title: `${dir === 'in' ? 'Received' : 'Sent'} ${ch === 'whatsapp' ? 'WhatsApp' : 'message'}`,
          detail: clamp(m.content),
          time: new Date(m.created_at),
        });
      }
    });

    // Emails
    emails.forEach((e: any) => {
      const dir: 'in' | 'out' = e.direction === 'inbound' ? 'in' : 'out';
      const badges: string[] = [];
      if (e.open_count) badges.push(`${e.open_count} open${e.open_count > 1 ? 's' : ''}`);
      if (e.click_count) badges.push(`${e.click_count} click${e.click_count > 1 ? 's' : ''}`);
      entries.push({
        id: `email-${e.id}`,
        kind: 'email',
        icon: Mail,
        tone: TONES.email,
        direction: dir,
        title: e.subject || '(no subject)',
        subtitle: dir === 'in' ? `From ${e.from_email || email || 'lead'}` : `To ${e.to_email || email || 'lead'}`,
        time: new Date(e.sent_at || e.created_at),
        badges,
        onClick: () => setPreviewEmail(e as EmailLogRow),
      });
    });

    // SMS / WhatsApp
    smsRows.forEach((s: any) => {
      const dir: 'in' | 'out' = s.direction === 'inbound' ? 'in' : 'out';
      const isWA = s.channel === 'whatsapp';
      const badges: string[] = [];
      if (s.status && !['delivered', 'sent'].includes(String(s.status))) badges.push(String(s.status));
      entries.push({
        id: `sms-${s.id}`,
        kind: 'sms',
        icon: isWA ? MessageCircle : MessageSquare,
        tone: TONES.sms,
        direction: dir,
        title: `${dir === 'in' ? 'Received' : 'Sent'} ${isWA ? 'WhatsApp' : 'SMS'}`,
        subtitle: dir === 'in' ? `From ${s.from_number || ''}` : `To ${s.to_number || ''}`,
        detail: clamp(s.body),
        time: new Date(s.sent_at || s.created_at),
        badges,
      });
    });

    // Engagement (opens / clicks)
    engagement.forEach((ev: any) => {
      const t = String(ev.event_type || '').toLowerCase();
      const isClick = t.includes('click');
      entries.push({
        id: `eng-${ev.id}`,
        kind: 'engagement',
        icon: isClick ? MousePointerClick : MailOpen,
        tone: TONES.engagement,
        title: isClick
          ? `Clicked ${ev.metadata?.button ? `"${ev.metadata.button}"` : 'a link'}`
          : 'Opened email',
        subtitle: ev.template_name || ev.campaign_name || undefined,
        detail: ev.link_url || undefined,
        time: new Date(ev.occurred_at || ev.created_at),
      });
    });

    // Forms
    forms.forEach((f: any) => {
      entries.push({
        id: `form-${f.id}`,
        kind: 'form',
        icon: FileText,
        tone: TONES.form,
        title: `Form submitted${f.form_name ? ` · ${f.form_name}` : f.form_type ? ` · ${f.form_type}` : ''}`,
        subtitle: f.property_name || undefined,
        time: new Date(f.submitted_at || f.created_at),
      });
    });

    // Web/presale activity events (excluding email opens/clicks already in engagement)
    activityEvents.forEach((ev: any) => {
      const t = String(ev.type || '');
      if (['email_open', 'email_opened', 'email_click', 'email_clicked', 'link_click'].includes(t)) return;
      entries.push({
        id: `act-${ev.id}`,
        kind: 'engagement',
        icon: Eye,
        tone: TONES.engagement,
        title: t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()),
        subtitle: ev.project_slug || undefined,
        time: new Date(ev.occurred_at || ev.received_at),
      });
    });

    // Showings
    showings.forEach((s: any) => {
      entries.push({
        id: `showing-${s.id}`,
        kind: 'showing',
        icon: CalendarDays,
        tone: TONES.showing,
        title: `Showing · ${s.project}${s.unit ? ` — Unit ${s.unit}` : ''}`,
        subtitle: s.status,
        detail: clamp(s.notes),
        time: new Date(s.created_at),
      });
    });

    // Tasks
    tasks.forEach((t: any) => {
      entries.push({
        id: `task-${t.id}`,
        kind: 'task',
        icon: t.status === 'completed' ? CheckCircle : CheckCircle,
        tone: TONES.task,
        title: t.title,
        subtitle: t.status,
        detail: clamp(t.description),
        time: new Date(t.created_at),
      });
    });

    return entries.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [messages, emails, smsRows, engagement, forms, activityEvents, showings, tasks, email]);

  const filtered = useMemo(
    () => filter === 'all' ? timeline : timeline.filter(e => e.kind === filter),
    [timeline, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: timeline.length };
    timeline.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; });
    return c;
  }, [timeline]);

  // Group by date label
  const grouped = useMemo(() => {
    const groups: { label: string; items: TimelineEntry[] }[] = [];
    let current = '';
    filtered.forEach(e => {
      const label = dateGroup(e.time);
      if (label !== current) {
        groups.push({ label, items: [e] });
        current = label;
      } else {
        groups[groups.length - 1].items.push(e);
      }
    });
    return groups;
  }, [filtered]);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addMessage.mutate({
      contact_id: contactId,
      direction: 'outbound',
      content: noteText.trim(),
      channel: 'note',
      sent_by: 'Agent',
      message_type: 'note',
    });
    setNoteText('');
    setShowNoteInput(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {timeline.length} {timeline.length === 1 ? 'event' : 'events'} logged
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNoteInput(v => !v)}>
          <StickyNote className="w-3.5 h-3.5" /> Add Note
        </Button>
      </div>

      {/* Filter rail */}
      <div className="px-5 pb-3 border-b border-border/50">
        <div className="flex items-center gap-1.5 flex-wrap">
          {KIND_FILTERS.map(f => {
            const n = counts[f.key] ?? 0;
            const active = filter === f.key;
            const disabled = f.key !== 'all' && n === 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                disabled={disabled}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[11px] font-medium border transition-colors',
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50',
                  disabled && 'opacity-40 cursor-not-allowed hover:bg-background hover:text-muted-foreground',
                )}
              >
                {f.label}
                {n > 0 && (
                  <span className={cn(
                    'rounded-full px-1.5 text-[10px] leading-4',
                    active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
                  )}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add note inline */}
      {showNoteInput && (
        <div className="px-5 pt-4 pb-2 space-y-2 border-b border-border/50">
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this lead..."
            className="text-sm min-h-[80px]"
            maxLength={2000}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowNoteInput(false); setNoteText(''); }}>Cancel</Button>
            <Button size="sm" className="gap-1" onClick={handleAddNote} disabled={!noteText.trim() || addMessage.isPending}>
              <Send className="w-3.5 h-3.5" /> Save Note
            </Button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="px-5 py-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {filter === 'all' ? 'No activity yet.' : `No ${KIND_LABEL[filter as Kind].toLowerCase()} activity yet.`}
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.label}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>

                <ul className="space-y-1.5">
                  {group.items.map(entry => {
                    const Icon = entry.icon;
                    const clickable = !!entry.onClick;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={entry.onClick}
                          className={cn(
                            'w-full text-left flex items-start gap-3 rounded-lg p-2.5 transition-colors',
                            'border border-transparent',
                            clickable && 'hover:bg-muted/40 hover:border-border cursor-pointer',
                          )}
                        >
                          {/* Icon chip */}
                          <div className={cn(
                            'mt-0.5 flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ring-1',
                            entry.tone.bg, entry.tone.ring,
                          )}>
                            <Icon className={cn('w-3.5 h-3.5', entry.tone.text)} strokeWidth={2} />
                          </div>

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn(
                                'inline-flex items-center px-1.5 h-4 rounded text-[9px] font-bold uppercase tracking-wider',
                                entry.tone.chip,
                              )}>
                                {KIND_LABEL[entry.kind]}
                              </span>
                              {entry.direction && (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                  {entry.direction === 'in' ? 'IN' : 'OUT'}
                                </span>
                              )}
                              <span className="text-sm font-medium text-foreground truncate">
                                {entry.title}
                              </span>
                            </div>

                            {entry.subtitle && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {entry.subtitle}
                              </p>
                            )}
                            {entry.detail && (
                              <p className="text-[12px] text-foreground/70 mt-1 line-clamp-2">
                                {entry.detail}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="text-[10px] text-muted-foreground"
                                title={format(entry.time, "PPp")}
                              >
                                {format(entry.time, 'h:mm a')} · {formatDistanceToNow(entry.time, { addSuffix: true })}
                              </span>
                              {entry.badges?.map(b => (
                                <span
                                  key={b}
                                  className="text-[10px] px-1.5 h-4 inline-flex items-center rounded bg-muted text-muted-foreground"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          </div>

                          {clickable && (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 mt-2 flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => !o && setPreviewEmail(null)}
        contactEmail={email}
      />
    </div>
  );
}
