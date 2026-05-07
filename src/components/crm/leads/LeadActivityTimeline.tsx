import { useState, useMemo } from 'react';
import {
  MessageCircle, Mail, CalendarDays, CheckCircle, StickyNote, Send,
  MailOpen, MousePointerClick, FileText, Eye, Phone, MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useCrmContactMessages, useCrmContactShowings, useCrmContactTasks, useAddCrmMessage,
} from '@/hooks/useCrmLeadDetail';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog } from '@/hooks/useCrmContactSmsLog';
import {
  useCrmContactForms,
  useCrmContactEngagement,
  useCrmContactActivityEvents,
} from '@/hooks/useCrmLeadCommunications';
import { useCrmContact } from '@/hooks/useCrmLeadDetail';

interface TimelineEntry {
  id: string;
  icon: typeof MessageCircle;
  color: string;
  text: string;
  detail?: string;
  time: Date;
  kind: string;
}

const KIND_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'email', label: 'Emails' },
  { key: 'sms', label: 'SMS' },
  { key: 'engagement', label: 'Opens/Clicks' },
  { key: 'form', label: 'Forms' },
  { key: 'showing', label: 'Showings' },
  { key: 'task', label: 'Tasks/Notes' },
];

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
  const [filter, setFilter] = useState<string>('all');

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    messages.forEach((m: any) => {
      const ch = m.channel ?? 'message';
      const isWhatsApp = ch === 'whatsapp';
      const isCall = ch === 'call' || m.message_type === 'call';
      entries.push({
        id: `msg-${m.id}`,
        icon: isCall ? Phone : isWhatsApp ? MessageCircle : MessageSquare,
        color: isCall ? 'hsl(38 92% 50%)' : isWhatsApp ? 'hsl(142 71% 45%)' : 'hsl(210 62% 46%)',
        text: `${m.direction === 'inbound' ? 'Received' : 'Sent'} ${ch}`,
        detail: m.content ? (m.content.length > 140 ? m.content.slice(0, 140) + '…' : m.content) : undefined,
        time: new Date(m.created_at),
        kind: isCall ? 'task' : 'sms',
      });
    });

    emails.forEach((e: any) => {
      entries.push({
        id: `email-${e.id}`,
        icon: Mail,
        color: 'hsl(210 62% 46%)',
        text: `${e.direction === 'inbound' ? 'Received' : 'Sent'} email — ${e.subject || '(no subject)'}`,
        detail: [
          e.open_count ? `Opened ${e.open_count}×` : null,
          e.click_count ? `Clicked ${e.click_count}×` : null,
        ].filter(Boolean).join(' · ') || undefined,
        time: new Date(e.sent_at || e.created_at),
        kind: 'email',
      });
    });

    smsRows.forEach((s: any) => {
      const ch = s.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
      entries.push({
        id: `sms-${s.id}`,
        icon: s.channel === 'whatsapp' ? MessageCircle : MessageSquare,
        color: s.channel === 'whatsapp' ? 'hsl(142 71% 45%)' : 'hsl(199 89% 48%)',
        text: `${s.direction === 'inbound' ? 'Received' : 'Sent'} ${ch}${s.status ? ` (${s.status})` : ''}`,
        detail: s.body ? (s.body.length > 140 ? s.body.slice(0, 140) + '…' : s.body) : undefined,
        time: new Date(s.sent_at || s.created_at),
        kind: 'sms',
      });
    });

    engagement.forEach((ev: any) => {
      const isClick = ev.event_type === 'click' || ev.event_type === 'email_click';
      entries.push({
        id: `eng-${ev.id}`,
        icon: isClick ? MousePointerClick : MailOpen,
        color: isClick ? 'hsl(280 70% 55%)' : 'hsl(199 89% 48%)',
        text: isClick
          ? `Clicked link${ev.metadata?.button ? ` (${ev.metadata.button})` : ''}`
          : 'Opened email',
        detail: ev.template_name || ev.campaign_name || ev.link_url || undefined,
        time: new Date(ev.occurred_at || ev.created_at),
        kind: 'engagement',
      });
    });

    forms.forEach((f: any) => {
      entries.push({
        id: `form-${f.id}`,
        icon: FileText,
        color: 'hsl(160 65% 42%)',
        text: `Form: ${f.form_name || f.form_type || 'submitted'}`,
        detail: f.property_name || undefined,
        time: new Date(f.submitted_at || f.created_at),
        kind: 'form',
      });
    });

    activityEvents.forEach((ev: any) => {
      // Avoid duplicating engagement (already covered) — only surface page_view, return_visit, contact_form, etc.
      if (['email_open', 'email_opened', 'email_click', 'email_clicked', 'link_click'].includes(ev.type)) return;
      entries.push({
        id: `act-${ev.id}`,
        icon: Eye,
        color: 'hsl(220 14% 50%)',
        text: ev.type.replace(/_/g, ' '),
        detail: ev.project_slug || undefined,
        time: new Date(ev.occurred_at || ev.received_at),
        kind: 'engagement',
      });
    });

    showings.forEach((s: any) => {
      entries.push({
        id: `showing-${s.id}`,
        icon: CalendarDays,
        color: 'hsl(270 60% 55%)',
        text: `Showing: ${s.project}${s.unit ? ` — Unit ${s.unit}` : ''} (${s.status})`,
        detail: s.notes || undefined,
        time: new Date(s.created_at),
        kind: 'showing',
      });
    });

    tasks.forEach((t: any) => {
      entries.push({
        id: `task-${t.id}`,
        icon: t.message_type === 'note' ? StickyNote : CheckCircle,
        color: t.status === 'completed' ? 'hsl(142 71% 45%)' : 'hsl(38 92% 50%)',
        text: t.title,
        detail: t.description || undefined,
        time: new Date(t.created_at),
        kind: 'task',
      });
    });

    return entries.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [messages, emails, smsRows, engagement, forms, activityEvents, showings, tasks]);

  const filtered = useMemo(
    () => filter === 'all' ? timeline : timeline.filter(e => e.kind === filter),
    [timeline, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: timeline.length };
    timeline.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; });
    return c;
  }, [timeline]);

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
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNoteInput(!showNoteInput)}>
          <StickyNote className="w-3.5 h-3.5" /> Add Note
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {KIND_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
              filter === f.key
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50'
            }`}
          >
            {f.label}
            {counts[f.key] ? <span className="ml-1 text-[10px] opacity-70">{counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      {showNoteInput && (
        <div className="mb-4 space-y-2">
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

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No activity yet.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-0">
            {filtered.map((entry) => (
              <div key={entry.id} className="relative flex gap-3 py-2.5 group">
                <div
                  className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 border-2 border-card"
                  style={{ background: entry.color.replace(')', ' / 0.15)') }}
                >
                  <entry.icon className="w-3 h-3" style={{ color: entry.color }} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{entry.text}</p>
                  {entry.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.detail}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(entry.time, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
