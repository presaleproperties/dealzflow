import { useMemo, useState } from 'react';
import { StickyNote, ChevronDown, Phone, MessageSquare, Mail, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { parseImportedNotes, groupNotesByDay, type NoteKind } from '@/lib/cleanNotes';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { cn } from '@/lib/utils';

const KIND_META: Record<NoteKind, { icon: typeof Phone; label: string; tone: string }> = {
  call:        { icon: Phone,         label: 'Call',        tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  text:        { icon: MessageSquare, label: 'Text',        tone: 'text-sky-500 bg-sky-500/10 border-sky-500/20' },
  email:       { icon: Mail,          label: 'Email',       tone: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
  appointment: { icon: Calendar,      label: 'Appointment', tone: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  note:        { icon: FileText,      label: 'Note',        tone: 'text-muted-foreground bg-muted/40 border-border' },
};

export function LeadNotesCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.notes ?? '');
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(() => parseImportedNotes(contact.notes), [contact.notes]);
  const groups = useMemo(() => groupNotesByDay(entries), [entries]);

  // Show first 2 day-groups by default
  const visibleGroups = showAll ? groups : groups.slice(0, 2);
  const hiddenGroupCount = groups.length - visibleGroups.length;
  const hiddenEntryCount = groups.slice(visibleGroups.length).reduce((n, g) => n + g.entries.length, 0);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (contact.notes ?? '').trim()) {
      updateContact.mutate({ id: contact.id, updates: { notes: trimmed || null } });
    }
    setEditing(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <StickyNote className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
          Activity Notes
          {entries.length > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground ml-1">
              {entries.length} · {groups.length} day{groups.length === 1 ? '' : 's'}
            </span>
          )}
        </h3>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setDraft(contact.notes ?? ''); setEditing(true); }}
          >
            {contact.notes ? 'Edit Raw' : 'Add Note'}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes about this contact..."
            className="text-sm min-h-[160px] max-h-[320px] resize-y"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save}>Save</Button>
          </div>
        </div>
      ) : entries.length > 0 ? (
        <div className="space-y-4 max-h-[520px] overflow-y-auto -mr-2 pr-2">
          {visibleGroups.map(group => (
            <section key={group.key} className="space-y-2">
              {/* Day header */}
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-card/95 backdrop-blur-sm flex items-center gap-2">
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                  {group.entries.length}
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              {/* Entries for this day */}
              <ul className="space-y-1.5">
                {group.entries.map((entry, i) => {
                  const meta = KIND_META[entry.kind];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={`${group.key}-${i}`}
                      className="group flex gap-2.5 rounded-lg border border-border/50 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className={cn(
                        'shrink-0 w-7 h-7 rounded-md border flex items-center justify-center',
                        meta.tone,
                      )}>
                        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                            {meta.label}
                            {entry.actor && (
                              <span className="ml-1.5 normal-case font-normal text-muted-foreground/60">
                                · {entry.actor}
                              </span>
                            )}
                          </span>
                          {entry.timestamp && (
                            <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                              {entry.timestamp.split(',').slice(-1)[0].trim()}
                            </span>
                          )}
                        </div>
                        <p className="text-[12.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                          {entry.text}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {hiddenGroupCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <ChevronDown className="w-3 h-3 mr-1" />
              Show {hiddenEntryCount} older entr{hiddenEntryCount === 1 ? 'y' : 'ies'} across {hiddenGroupCount} day{hiddenGroupCount === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
