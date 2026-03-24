import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLeadNotes, useAddLeadNote, useZaraActivity } from '@/hooks/useConversations';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

const activityIcons: Record<string, string> = {
  message_sent:           '💬',
  qualification_update:   '📋',
  appointment_booked:     '📅',
  escalation_triggered:   '🚨',
  guardrail_hit:          '🛡️',
  stage_changed:          '🔄',
};

export function NotesPanel({ conversationId }: { conversationId: string }) {
  const [newNote, setNewNote] = useState('');
  const { data: notes = [] } = useLeadNotes(conversationId);
  const addNote = useAddLeadNote();

  const handleAdd = () => {
    if (!newNote.trim()) return;
    addNote.mutate({ conversationId, body: newNote.trim() });
    setNewNote('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add note */}
      <div className="p-3 border-b border-border/40 space-y-2">
        <Textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note about this lead..."
          className="text-[12px] min-h-[72px] resize-none bg-muted/40"
          rows={3}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newNote.trim() || addNote.isPending}
          className="h-7 text-[11px] px-3"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Note
        </Button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {notes.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center py-6">No notes yet</p>
        )}
        {notes.map(note => (
          <div key={note.id} className="bg-muted/40 rounded-xl p-3">
            <p className="text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{note.body}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1.5">
              {format(new Date(note.created_at), 'MMM d, h:mm a')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityPanel({ conversationId }: { conversationId: string }) {
  const { data: activities = [] } = useZaraActivity(conversationId);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {activities.length === 0 && (
        <p className="text-[12px] text-muted-foreground/50 text-center py-6">No Zara activity yet</p>
      )}
      {activities.map(activity => (
        <div key={activity.id} className="flex items-start gap-2.5">
          <span className="text-[16px] flex-shrink-0 mt-0.5">
            {activityIcons[activity.action_type] || '⚡'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground/80 leading-snug">
              {activity.description || activity.action_type.replace(/_/g, ' ')}
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              {format(new Date(activity.created_at), 'MMM d, h:mm a')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
