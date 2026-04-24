import { useMemo, useState } from 'react';
import { StickyNote, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { parseImportedNotes } from '@/lib/cleanNotes';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function LeadNotesCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.notes ?? '');
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(() => parseImportedNotes(contact.notes), [contact.notes]);
  const visible = showAll ? entries : entries.slice(0, 3);
  const hiddenCount = entries.length - visible.length;

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
          Notes
          {entries.length > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground ml-1">
              {entries.length}
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
            {contact.notes ? 'Edit' : 'Add Note'}
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
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto -mr-2 pr-2">
          {visible.map((entry, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 hover:bg-muted/30 transition-colors"
            >
              {entry.timestamp && (
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  {entry.timestamp}
                </div>
              )}
              <p className="text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                {entry.text}
              </p>
            </div>
          ))}
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <ChevronDown className="w-3 h-3 mr-1" />
              Show {hiddenCount} older note{hiddenCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
