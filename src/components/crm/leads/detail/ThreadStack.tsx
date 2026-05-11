import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmailNoteCard } from '@/components/crm/leads/EmailNoteCard';
import { SmsNoteCard } from '@/components/crm/leads/SmsNoteCard';
import type { EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import type { CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';
import type { CrmNote } from '@/hooks/useCrmNotes';

/**
 * Strip Re:/Fwd:/Fw: prefixes for thread matching.
 */
export function normalizeSubject(s?: string | null): string {
  return (s || '')
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, '')
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, '')
    .trim()
    .toLowerCase();
}

interface EmailThreadStackProps {
  emails: { note: CrmNote; row: EmailLogRow }[];
  contactEmail?: string | null;
  onOpen: (noteId: string) => void;
}

/**
 * Stack of emails sharing a normalized subject. Shows the latest expanded
 * with a hairline "+N earlier" toggle; older replies expand inline below
 * indented like a quoted thread.
 */
export function EmailThreadStack({ emails, contactEmail, onOpen }: EmailThreadStackProps) {
  const [open, setOpen] = useState(false);
  if (emails.length === 0) return null;
  const [latest, ...older] = emails;
  return (
    <div className="space-y-1">
      <EmailNoteCard
        email={latest.row}
        contactEmail={contactEmail}
        onOpen={() => onOpen(latest.note.id)}
      />
      {older.length > 0 && (
        <div className="pl-4">
          <button
            onClick={() => setOpen(o => !o)}
            className={cn(
              'inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors',
              'pl-5 pr-2 py-1 -ml-5 rounded-md hover:bg-muted/40',
            )}
          >
            <ChevronDown
              className={cn('w-3 h-3 transition-transform', open ? 'rotate-0' : '-rotate-90')}
            />
            {open ? 'Hide' : 'Show'} {older.length} earlier reply{older.length === 1 ? '' : 'ies'}
          </button>
          {open && (
            <div className="mt-1 space-y-1 border-l border-border/50 pl-3 ml-1">
              {older.map(e => (
                <EmailNoteCard
                  key={e.note.id}
                  email={e.row}
                  contactEmail={contactEmail}
                  onOpen={() => onOpen(e.note.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SmsRunStackProps {
  messages: { note: CrmNote; row: CrmSmsLogRow }[];
  onOpen: (row: CrmSmsLogRow) => void;
}

/**
 * Run of consecutive SMS/WhatsApp messages on the same channel. Latest
 * stays expanded; older messages collapse behind a single toggle.
 */
export function SmsRunStack({ messages, onOpen }: SmsRunStackProps) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
  const [latest, ...older] = messages;
  const channelLabel = latest.row.channel === 'whatsapp' ? 'WhatsApp' : 'text';
  return (
    <div className="space-y-1">
      <SmsNoteCard message={latest.row} onOpen={() => onOpen(latest.row)} />
      {older.length > 0 && (
        <div className="pl-4">
          <button
            onClick={() => setOpen(o => !o)}
            className={cn(
              'inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors',
              'pl-5 pr-2 py-1 -ml-5 rounded-md hover:bg-muted/40',
            )}
          >
            <ChevronDown
              className={cn('w-3 h-3 transition-transform', open ? 'rotate-0' : '-rotate-90')}
            />
            {open ? 'Hide' : 'Show'} {older.length} earlier {channelLabel}
            {older.length === 1 ? '' : 's'}
          </button>
          {open && (
            <div className="mt-1 space-y-1 border-l border-border/50 pl-3 ml-1">
              {older.map(m => (
                <SmsNoteCard key={m.note.id} message={m.row} onOpen={() => onOpen(m.row)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
