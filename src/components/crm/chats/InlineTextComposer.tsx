import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Plus, Loader2 } from 'lucide-react';
import { useSendSms } from '@/hooks/useSms';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';

interface Props {
  contact: CrmContact;
  channel: 'sms' | 'whatsapp';
  /** Open the full composer (templates / media / scheduling). */
  onOpenFull: () => void;
  /** Fired right after a send is queued/sent so the parent can scroll to bottom. */
  onSent?: () => void;
}

/**
 * Inline iMessage-style composer for SMS / WhatsApp threads.
 * Lets the agent reply right inside the conversation instead of opening the
 * full Send dialog. The "+" button still launches `SendTextDialog` for
 * templates, attachments, scheduling, etc.
 */
export function InlineTextComposer({ contact, channel, onOpenFull, onSent }: Props) {
  const [body, setBody] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const sendSms = useSendSms();

  // Auto-grow textarea (1–6 lines).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [body]);

  const name = (contact.first_name || contact.last_name || 'lead').toString();
  const placeholder = `Message ${name.split(' ')[0]}…`;
  const canSend = body.trim().length > 0 && !!contact.phone && !sendSms.isPending;

  const send = () => {
    if (!body.trim()) return;
    if (!contact.phone) {
      toast.error('This lead has no phone number');
      return;
    }
    const text = body;
    setBody('');
    // Optimistically scroll the parent thread — message will land via realtime
    // shortly but the user expects the view to drop to the bottom immediately.
    onSent?.();
    sendSms.mutate(
      {
        contact_id: contact.id,
        to: contact.phone,
        body: text,
        channel,
      },
      {
        onSuccess: () => { onSent?.(); },
        onError: (err: any) => {
          // Restore the draft so the user doesn't lose what they typed.
          setBody(text);
          toast.error(err?.message || 'Failed to send');
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline (desktop convention).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onClick={onOpenFull}
          aria-label="More options"
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition"
        >
          <Plus className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-end rounded-3xl border border-border bg-muted/40 focus-within:bg-background focus-within:border-primary/40 transition-colors px-3 py-1.5">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-w-0 bg-transparent resize-none outline-none text-[15px] leading-snug py-1.5 max-h-[140px] placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-primary-foreground active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
          style={{ background: 'hsl(var(--primary))' }}
        >
          {sendSms.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
