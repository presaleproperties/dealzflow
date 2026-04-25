import { useState, useRef } from 'react';
import { Send, Phone, StickyNote, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAddNote } from '@/hooks/useCrmNotes';
import type { CrmContact } from '@/hooks/useCrmContacts';

type Mode = 'note' | 'call';

const MODES: { key: Mode; label: string; icon: typeof StickyNote; tint: string }[] = [
  { key: 'note',    label: 'Note',     icon: StickyNote,    tint: '45 90% 55%' },
  { key: 'call',    label: 'Log Call', icon: Phone,         tint: '142 70% 45%' },
];

const CALL_OUTCOMES = [
  'Connected', 'Voicemail', 'No answer', 'Busy', 'Wrong number', 'Not interested',
];

interface Props {
  contact: CrmContact;
}

/**
 * Quick composer for Note / Call Log only. Email / Text / Task / Showing
 * are reachable from the top bar and side panels — no need to duplicate them
 * here. ⌘+Enter saves.
 */
export function QuickActionBar({ contact }: Props) {
  const [mode, setMode] = useState<Mode>('note');
  const [body, setBody] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState(CALL_OUTCOMES[0]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const addNote = useAddNote();

  const switchMode = (next: Mode) => {
    setMode(next);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const reset = () => {
    setBody('');
    setCallDuration('');
    setCallOutcome(CALL_OUTCOMES[0]);
  };

  const save = () => {
    if (mode === 'note') {
      if (!body.trim()) return;
      addNote.mutate(
        { contact_id: contact.id, content: body.trim(), note_type: 'manual' },
        { onSuccess: reset },
      );
    } else if (mode === 'call') {
      if (!body.trim() && !callDuration && !callOutcome) return;
      const lines = [
        `📞 ${callOutcome}${callDuration ? ` · ${callDuration} min` : ''}`,
        body.trim(),
      ].filter(Boolean);
      addNote.mutate(
        { contact_id: contact.id, content: lines.join('\n\n'), note_type: 'call_log' },
        { onSuccess: reset },
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  const placeholder =
    mode === 'note' ? `What happened with ${contact.first_name || 'this lead'}?`
    : mode === 'call' ? 'Call notes — what was discussed, next steps…'
    : '';

  const canSave =
    (mode === 'note' && body.trim().length > 0) ||
    (mode === 'call' && (body.trim().length > 0 || !!callDuration));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Mode chip rail */}
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-border/60 overflow-x-auto bg-muted/30">
        {MODES.map((m) => {
          const active = mode === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => switchMode(m.key)}
              className={cn(
                'group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all',
                'border',
                active
                  ? 'shadow-sm'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card',
              )}
              style={
                active
                  ? {
                      background: `hsl(${m.tint} / 0.10)`,
                      borderColor: `hsl(${m.tint} / 0.40)`,
                      color: `hsl(${m.tint})`,
                    }
                  : undefined
              }
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Inline composer for Note / Call */}
      <div className="p-3 space-y-2.5">
        {mode === 'call' && (
          <div className="grid grid-cols-2 gap-2">
            <Select value={callOutcome} onValueChange={setCallOutcome}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALL_OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={callDuration}
                onChange={(e) => setCallDuration(e.target.value)}
                placeholder="Duration (min)"
                className="h-9 text-sm pl-8"
              />
            </div>
          </div>
        )}

        <Textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="text-sm min-h-[72px] resize-none border-border/60 focus-visible:ring-1"
        />

        <div className="flex items-center justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold">
            ⌘ + Enter to save
          </span>
          <Button
            size="sm"
            className="h-9 text-xs gap-1.5"
            onClick={save}
            disabled={!canSave || addNote.isPending}
          >
            <Send className="w-3.5 h-3.5" />
            {mode === 'call' ? 'Log Call' : 'Save Note'}
          </Button>
        </div>
      </div>
    </div>
  );
}
