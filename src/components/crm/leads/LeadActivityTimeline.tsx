import { useState, useMemo } from 'react';
import { MessageCircle, Mail, CalendarDays, CheckCircle, StickyNote, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCrmContactMessages, useCrmContactShowings, useCrmContactTasks, useAddCrmMessage } from '@/hooks/useCrmLeadDetail';

interface TimelineEntry {
  id: string;
  icon: typeof MessageCircle;
  color: string;
  text: string;
  detail?: string;
  time: Date;
}

export function LeadActivityTimeline({ contactId }: { contactId: string }) {
  const { data: messages = [] } = useCrmContactMessages(contactId);
  const { data: showings = [] } = useCrmContactShowings(contactId);
  const { data: tasks = [] } = useCrmContactTasks(contactId);
  const addMessage = useAddCrmMessage();

  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    messages.forEach((m: any) => {
      const isWhatsApp = m.channel === 'whatsapp';
      entries.push({
        id: `msg-${m.id}`,
        icon: isWhatsApp ? MessageCircle : Mail,
        color: isWhatsApp ? 'hsl(142 71% 45%)' : 'hsl(210 62% 46%)',
        text: `${m.direction === 'inbound' ? 'Received' : 'Sent'} ${m.channel ?? 'message'}`,
        detail: m.content ? (m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content) : undefined,
        time: new Date(m.created_at),
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
      });
    });

    return entries.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [messages, showings, tasks]);

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNoteInput(!showNoteInput)}>
          <StickyNote className="w-3.5 h-3.5" /> Add Note
        </Button>
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

      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No activity yet.</p>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-0">
            {timeline.map((entry) => (
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
