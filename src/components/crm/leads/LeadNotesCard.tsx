import { useState } from 'react';
import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function LeadNotesCard({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.notes ?? '');

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
            className="text-sm min-h-[120px] max-h-[200px] resize-none"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save}>Save</Button>
          </div>
        </div>
      ) : contact.notes ? (
        <div
          className="text-sm text-foreground/80 whitespace-pre-wrap overflow-y-auto cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors"
          style={{ maxHeight: '200px' }}
          onClick={() => { setDraft(contact.notes ?? ''); setEditing(true); }}
        >
          {contact.notes}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
