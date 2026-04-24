import { useState, useMemo } from 'react';
import {
  StickyNote, Zap, Mail, Phone, Download, Pin, PinOff,
  Pencil, MoreHorizontal, Trash2, Send, Plus,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLeadNotes, useAddNote, useUpdateNote, useDeleteNote, type CrmNote } from '@/hooks/useCrmNotes';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'manual' | 'email' | 'call_log' | 'system';

const NOTE_TYPE_META: Record<string, { icon: typeof StickyNote; label: string }> = {
  manual: { icon: StickyNote, label: 'Note' },
  system: { icon: Zap, label: 'System' },
  email: { icon: Mail, label: 'Email' },
  call_log: { icon: Phone, label: 'Call' },
  import: { icon: Download, label: 'Imported Note' },
  zapier: { icon: Zap, label: 'Zapier' },
};

function getDateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function NoteCard({
  note,
  isOwn,
  onPin,
  onEdit,
  onDelete,
}: {
  note: CrmNote;
  isOwn: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = NOTE_TYPE_META[note.note_type] || NOTE_TYPE_META.manual;
  const Icon = meta.icon;
  const time = format(parseISO(note.event_at || note.created_at), 'h:mm a');

  return (
    <div className="group relative flex gap-3">
      {/* Timeline dot */}
      <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 bg-muted/50 border border-border/60">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
      </div>

      {/* Card */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl border border-border/40 bg-card/60 p-3 transition-all',
          note.is_pinned && 'border-l-2 border-l-primary/60',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
            <span className="font-medium text-foreground/70">{meta.label}</span>
            <span>·</span>
            <span>{time}</span>
            {note.is_pinned && <Pin className="w-3 h-3 text-primary" />}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onPin}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title={note.is_pinned ? 'Unpin' : 'Pin'}
            >
              {note.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
            {isOwn && (
              <button
                onClick={onEdit}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {isOwn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive gap-2">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-1.5 leading-relaxed">
          {note.content}
        </p>
      </div>
    </div>
  );
}

export function LeadNotesActivity({ contactId }: { contactId: string }) {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: notes = [], isLoading } = useLeadNotes(contactId);
  const addNote = useAddNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [draft, setDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Filter
  const filteredNotes = useMemo(() => {
    if (filter === 'all') return notes;
    if (filter === 'manual') return notes.filter(n => n.note_type === 'manual' || n.note_type === 'import' || n.note_type === 'note');
    if (filter === 'call_log') return notes.filter(n => n.note_type === 'call_log' || n.note_type === 'call');
    if (filter === 'email') return notes.filter(n => n.note_type === 'email' || n.note_type === 'text');
    return notes.filter(n => n.note_type === filter);
  }, [notes, filter]);

  const pinnedNotes = useMemo(() => filteredNotes.filter(n => n.is_pinned), [filteredNotes]);
  const unpinnedNotes = useMemo(() => filteredNotes.filter(n => !n.is_pinned), [filteredNotes]);

  // Group by event date (true event time, not import time)
  const groupedNotes = useMemo(() => {
    const groups: { label: string; notes: CrmNote[] }[] = [];
    let currentLabel = '';
    unpinnedNotes.forEach(note => {
      const label = getDateGroup(note.event_at || note.created_at);
      if (label !== currentLabel) {
        groups.push({ label, notes: [note] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].notes.push(note);
      }
    });
    return groups;
  }, [unpinnedNotes]);

  // Filter counts
  const counts = useMemo(() => ({
    all: notes.length,
    manual: notes.filter(n => n.note_type === 'manual' || n.note_type === 'import' || n.note_type === 'note').length,
    email: notes.filter(n => n.note_type === 'email' || n.note_type === 'text').length,
    call_log: notes.filter(n => n.note_type === 'call_log' || n.note_type === 'call').length,
    system: notes.filter(n => n.note_type === 'system').length,
  }), [notes]);

  const handleSave = () => {
    if (!draft.trim()) return;
    addNote.mutate({
      contact_id: contactId,
      content: draft.trim(),
      note_type: 'manual',
      is_pinned: pinDraft,
    });
    setDraft('');
    setPinDraft(false);
    setFocused(false);
  };

  const handleEditSave = (noteId: string) => {
    if (!editContent.trim()) return;
    updateNote.mutate({ id: noteId, contactId, updates: { content: editContent.trim() } });
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
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <StickyNote className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
          Notes & Activity
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setFocused(true)}
        >
          <Plus className="w-3.5 h-3.5" /> Add Note
        </Button>
      </div>

      {/* Quick note input */}
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Write a note..."
          className={cn(
            'text-sm transition-all duration-200 resize-none',
            focused ? 'min-h-[100px]' : 'min-h-[44px]',
          )}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        {focused && (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={pinDraft}
                onCheckedChange={v => setPinDraft(!!v)}
                className="h-3.5 w-3.5"
              />
              Pin this note
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFocused(false); setDraft(''); setPinDraft(false); }}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={!draft.trim() || addNote.isPending}>
                <Send className="w-3 h-3" /> Save
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border',
              filter === f.key
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-muted/30 text-muted-foreground border-border/40 hover:bg-muted/50',
            )}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notes feed */}
      <div className="relative max-h-[500px] overflow-y-auto space-y-1 pr-1">
        {/* Vertical timeline line */}
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
            {pinnedNotes.map(note => (
              editingId === note.id ? (
                <div key={note.id} className="pl-10 space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="text-sm min-h-[80px]"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleEditSave(note.id)}>Save</Button>
                  </div>
                </div>
              ) : (
                <NoteCard
                  key={note.id}
                  note={note}
                  isOwn={note.user_id === currentUserId}
                  onPin={() => updateNote.mutate({ id: note.id, contactId, updates: { is_pinned: !note.is_pinned } })}
                  onEdit={() => { setEditingId(note.id); setEditContent(note.content); }}
                  onDelete={() => deleteNote.mutate({ id: note.id, contactId })}
                />
              )
            ))}
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
            {group.notes.map(note => (
              editingId === note.id ? (
                <div key={note.id} className="pl-10 space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="text-sm min-h-[80px]"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleEditSave(note.id)}>Save</Button>
                  </div>
                </div>
              ) : (
                <NoteCard
                  key={note.id}
                  note={note}
                  isOwn={note.user_id === currentUserId}
                  onPin={() => updateNote.mutate({ id: note.id, contactId, updates: { is_pinned: !note.is_pinned } })}
                  onEdit={() => { setEditingId(note.id); setEditContent(note.content); }}
                  onDelete={() => deleteNote.mutate({ id: note.id, contactId })}
                />
              )
            ))}
          </div>
        ))}

        {/* Empty state */}
        {!isLoading && filteredNotes.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {filter === 'all' ? 'No notes or activity yet.' : `No ${filter} entries yet.`}
          </p>
        )}
      </div>
    </div>
  );
}
