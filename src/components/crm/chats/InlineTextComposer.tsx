import { useEffect, useImperativeHandle, useRef, useState, forwardRef, type KeyboardEvent } from 'react';
import { Send, Plus, FileText, Image as ImageIcon, Variable, MoreHorizontal, X as XIcon, CornerUpLeft } from 'lucide-react';
import { useSendSms } from '@/hooks/useSms';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface InlineTextComposerHandle {
  /** Set body to a quoted reply preview and focus the textarea. */
  quoteReply: (text: string) => void;
  focus: () => void;
}

interface Props {
  contact: CrmContact;
  channel: 'sms' | 'whatsapp';
  /** Conversation id — passed through to useSendSms so the optimistic
   *  bubble lands in the chat-thread cache instantly. */
  conversationId?: string | null;
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
export function InlineTextComposer({ contact, channel, conversationId, onOpenFull, onSent }: Props) {
  const [body, setBody] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const sendSms = useSendSms();

  // Auto-grow textarea (1–6 lines). Min height matches a single line so the
  // dock stays slim until the user actually types multiple lines.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 22), 120);
    el.style.height = `${next}px`;
  }, [body]);

  const name = (contact.first_name || contact.last_name || 'lead').toString();
  const placeholder = `Message ${name.split(' ')[0]}…`;
  // Send is fire-and-forget — never disable on isPending. The optimistic
  // bubble + cleared input give the user "tap, gone" feedback so they can
  // immediately type and send the next message (iMessage parity).
  const canSend = body.trim().length > 0 && !!contact.phone;

  const send = () => {
    if (!body.trim()) return;
    if (!contact.phone) {
      toast.error('This lead has no phone number');
      return;
    }
    const text = body;
    setBody('');
    // Reset textarea height immediately so the dock doesn't visibly snap.
    if (taRef.current) taRef.current.style.height = 'auto';
    // Optimistic scroll — bubble lands in cache via onMutate, then we drop
    // to the bottom so it's visible even on small screens.
    onSent?.();
    sendSms.mutate(
      {
        contact_id: contact.id,
        to: contact.phone,
        body: text,
        channel,
        conversation_id: conversationId ?? undefined,
      },
      {
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

  const charCount = body.length;
  const showCounter = charCount > 140;
  const segments = Math.max(1, Math.ceil(charCount / 160));

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-border/70 bg-background/85 backdrop-blur-xl"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        paddingTop: '8px',
        transform: 'translate3d(0, calc(var(--keyboard-inset-bottom, 0px) * -1), 0)',
        willChange: 'transform',
        transition: 'transform 180ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="mx-auto w-full max-w-[820px] px-3 sm:px-4">
        <div className="flex items-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Attachments and templates"
                className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={8} className="w-56 p-1">
              <button
                type="button"
                onClick={(e) => { (e.currentTarget.closest('[data-radix-popper-content-wrapper]') as HTMLElement | null)?.querySelector<HTMLElement>('[data-close]')?.click(); onOpenFull(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
              >
                <FileText className="w-4 h-4 text-muted-foreground" /> Insert template
              </button>
              <button
                type="button"
                onClick={onOpenFull}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
              >
                <ImageIcon className="w-4 h-4 text-muted-foreground" /> Attach photo / file
              </button>
              <button
                type="button"
                onClick={onOpenFull}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
              >
                <Variable className="w-4 h-4 text-muted-foreground" /> Insert variable
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={onOpenFull}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" /> Full composer…
              </button>
            </PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0 relative flex items-end rounded-[22px] border border-border/70 bg-muted/30 focus-within:bg-background focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.10)] transition-all px-4 py-1">
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                const drop = () => {
                  const sc = (taRef.current?.closest('[class*="overflow-y-auto"]') as HTMLElement | null)
                    ?? document.querySelector('[data-thread-scroll]') as HTMLElement | null;
                  sc?.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
                };
                setTimeout(drop, 120);
                setTimeout(drop, 360);
              }}
              placeholder={placeholder}
              rows={1}
              enterKeyHint="send"
              className="flex-1 min-w-0 bg-transparent resize-none outline-none text-[15px] leading-[1.4] py-2 max-h-[140px] placeholder:text-muted-foreground/70"
            />
            {showCounter && (
              <span className="pointer-events-none absolute right-3 bottom-1 text-[10px] tabular-nums text-muted-foreground/70">
                {charCount}{segments > 1 ? ` · ${segments} segs` : ''}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className={
              'shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-95 ' +
              (canSend
                ? 'bg-primary text-primary-foreground shadow-sm hover:brightness-110'
                : 'bg-muted text-muted-foreground/60 cursor-not-allowed active:scale-100')
            }
          >
            <Send className="w-[15px] h-[15px] -translate-x-[1px] translate-y-[1px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
