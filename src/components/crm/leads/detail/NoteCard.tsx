import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Mail, Phone, StickyNote, Zap, Pin, PinOff, Pencil, MoreHorizontal, Trash2,
  Download, Globe, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateNote, useDeleteNote, type CrmNote } from '@/hooks/useCrmNotes';
import { formatNoteContent, LinkifiedText } from '@/lib/formatNoteContent';
import { cn } from '@/lib/utils';
import { noteTime } from './types';
import { AgentBadge } from './AgentBadge';

export type NoteMeta = { icon: typeof StickyNote; label: string; tint: string };

const NOTE_TYPE_META: Record<string, NoteMeta> = {
  manual:   { icon: StickyNote,    label: 'Note',         tint: '45 90% 55%'  },
  note:     { icon: StickyNote,    label: 'Note',         tint: '45 90% 55%'  },
  email:    { icon: Mail,          label: 'Email',        tint: '210 85% 58%' },
  call_log: { icon: Phone,         label: 'Call',         tint: '142 70% 45%' },
  sms:      { icon: MessageSquare, label: 'Text',         tint: '270 70% 60%' },
  text:     { icon: MessageSquare, label: 'Text',         tint: '270 70% 60%' },
  system:   { icon: Zap,           label: 'System',       tint: '220 10% 55%' },
  import:   { icon: Download,      label: 'Imported',     tint: '220 10% 55%' },
  zapier:   { icon: Globe,         label: 'Web activity', tint: '180 60% 45%' },
};

const FALLBACK_META: NoteMeta = { icon: StickyNote, label: 'Note', tint: '45 90% 55%' };

/** Refine a note's display meta based on parsed content. */
export function metaForNote(note: CrmNote): NoteMeta {
  const base = NOTE_TYPE_META[note.note_type] || FALLBACK_META;
  if (/website behavior summary/i.test(note.content)) {
    return { icon: Globe, label: 'Web activity', tint: '180 60% 45%' };
  }
  if (/inquired on|system auto-updated/i.test(note.content) && note.note_type === 'note') {
    return { icon: Download, label: 'Inquiry', tint: '220 10% 55%' };
  }
  return base;
}

export interface NoteCardProps {
  note: CrmNote;
  isOwn: boolean;
  contactId: string;
  editingId: string | null;
  editContent: string;
  onSetEditing: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  setEditContent: (v: string) => void;
  /** If provided and the note is a virtual email entry, the card opens
   *  the full email preview when clicked. */
  onOpenEmail?: (noteId: string) => void;
}

export function NoteCard({
  note, isOwn: _isOwn, contactId, editingId, editContent, onSetEditing,
  onCancelEdit, onSaveEdit, setEditContent, onOpenEmail,
}: NoteCardProps) {
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
  const isClickableEmail = isVirtual && !!onOpenEmail;

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
      <div
        className={cn(
          'flex-1 min-w-0 rounded-lg border bg-card px-3.5 py-3 transition-all border-l-[3px]',
          note.is_pinned ? 'border-foreground/20 bg-muted/30' : 'border-border/50',
          isClickableEmail && 'cursor-pointer hover:bg-muted/20 hover:border-primary/40',
        )}
        style={{ borderLeftColor: `hsl(${meta.tint})` }}
        onClick={isClickableEmail ? () => onOpenEmail!(note.id) : undefined}
        role={isClickableEmail ? 'button' : undefined}
        tabIndex={isClickableEmail ? 0 : undefined}
        onKeyDown={isClickableEmail
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEmail!(note.id); } }
          : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
            <span
              className="font-semibold uppercase tracking-[0.08em] text-[10px]"
              style={{ color: `hsl(${meta.tint})` }}
            >
              {isStructured && parsed.title ? parsed.title : meta.label}
            </span>
            {parsed.source && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">{parsed.source}</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span className="shrink-0 tabular-nums">{dateLabel} · {time}</span>
            {note.user_id && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <AgentBadge userId={note.user_id} prefix="by" />
              </>
            )}
            {isClickableEmail && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-primary font-medium shrink-0">View email →</span>
              </>
            )}
            {note.is_pinned && <Pin className="w-3 h-3 text-foreground/60 shrink-0 ml-0.5" />}
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
