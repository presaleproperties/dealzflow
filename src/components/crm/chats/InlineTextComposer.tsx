import { useEffect, useImperativeHandle, useRef, useState, forwardRef, type KeyboardEvent } from 'react';
import { Send, Plus, FileText, Image as ImageIcon, Variable, MoreHorizontal, X as XIcon, CornerUpLeft } from 'lucide-react';
import { useSendSms } from '@/hooks/useSms';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { triggerHaptic } from '@/lib/haptics';

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
export const InlineTextComposer = forwardRef<InlineTextComposerHandle, Props>(function InlineTextComposer(
  { contact, channel, conversationId, onOpenFull, onSent },
  ref,
) {
  const [body, setBody] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const sendSms = useSendSms();

  useImperativeHandle(ref, () => ({
    quoteReply: (text: string) => {
      const trimmed = (text || '').trim();
      setQuote(trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed);
      requestAnimationFrame(() => taRef.current?.focus());
    },
    focus: () => taRef.current?.focus(),
  }), []);

  // Auto-grow textarea (1–4 lines). Min height matches a single line so the
  // dock stays slim until the user actually types multiple lines.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 22), 92);
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
      triggerHaptic('error');
      toast.error('This lead has no phone number');
      return;
    }
    triggerHaptic('medium');
    // If a quote preview is attached, prepend it as ">" lines so the
    // recipient sees the context they're being replied to.
    const quotedPrefix = quote
      ? quote.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
      : '';
    const text = quotedPrefix + body;
    const draftBody = body;
    setBody('');
    setQuote(null);
    if (taRef.current) taRef.current.style.height = 'auto';
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
          setBody(draftBody);
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
      data-chat-composer="true"
      className="shrink-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur-xl"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        paddingTop: '6px',
        transform: 'translate3d(0, calc(var(--keyboard-inset-bottom, 0px) * -1), 0)',
        willChange: 'transform',
        // iOS visualViewport.resize only fires at start/end of the keyboard
        // animation, so without a CSS transition the composer would teleport
        // up and "wait" while the keyboard finishes sliding (the lag the
        // user reported in the standalone PWA). Match the iOS spring curve
        // so the composer rides the keyboard naturally.
        transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="mx-auto w-full max-w-[820px] px-3 sm:px-4">
        {quote && (
          <div className="mb-1.5 flex items-start gap-2 rounded-xl border border-border/50 bg-muted/40 px-2.5 py-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
            <CornerUpLeft className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-[12px] leading-snug text-muted-foreground line-clamp-2 whitespace-pre-wrap">
              {quote}
            </div>
            <button
              type="button"
              onClick={() => setQuote(null)}
              aria-label="Remove quote"
              className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Attachments and templates"
                className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition"
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

            <div className="flex-1 min-w-0 relative flex items-center rounded-full border border-border/60 bg-muted/30 focus-within:bg-background focus-within:border-primary/40 transition-colors px-3.5">
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                const drop = () => {
                  const sc = (taRef.current?.closest('[class*="overflow-y-auto"]') as HTMLElement | null)
                    ?? document.querySelector('[data-thread-scroll]') as HTMLElement | null;
                  sc?.scrollTo({ top: sc.scrollHeight, behavior: 'auto' });
                };
                requestAnimationFrame(drop);
                setTimeout(drop, 90);
              }}
              placeholder={placeholder}
              rows={1}
              enterKeyHint="send"
              className="m-textarea flex-1 min-w-0 bg-transparent resize-none outline-none text-[16px] leading-[20px] py-[4px] max-h-[92px] min-h-0 placeholder:text-muted-foreground/60"
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
               'shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-all active:scale-95 ' +
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
});
