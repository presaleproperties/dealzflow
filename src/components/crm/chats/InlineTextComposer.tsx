import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef, type KeyboardEvent } from 'react';
import { Send, Plus, FileText, Image as ImageIcon, Variable, X as XIcon, CornerUpLeft, ChevronLeft, Search as SearchIcon, Loader2 } from 'lucide-react';
import { useSendSms, useSmsTemplates, SMS_VARIABLES, renderSmsTemplate } from '@/hooks/useSms';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { triggerHaptic } from '@/lib/haptics';
import { isNative } from '@/lib/native';
import { supabase } from '@/integrations/supabase/client';

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
  const [media, setMedia] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusView, setPlusView] = useState<'menu' | 'templates' | 'variables'>('menu');
  const [tplFilter, setTplFilter] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sendSms = useSendSms();
  const { data: templates = [] } = useSmsTemplates();

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
    // Single-line baseline = 20px; cap at 5 lines.
    const next = Math.min(Math.max(el.scrollHeight, 20), 110);
    el.style.height = `${next}px`;
  }, [body]);

  // Reset popover state when it closes so it always opens on the menu view.
  useEffect(() => {
    if (!plusOpen) {
      setPlusView('menu');
      setTplFilter('');
    }
  }, [plusOpen]);

  const channelTemplates = useMemo(
    () => templates.filter((t) => t.is_active && (t.channel === channel || !t.channel)),
    [templates, channel],
  );
  const filteredTemplates = useMemo(() => {
    const q = tplFilter.trim().toLowerCase();
    if (!q) return channelTemplates;
    return channelTemplates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
    );
  }, [channelTemplates, tplFilter]);

  const renderCtx = useMemo(() => ({
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    full_name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    email: contact.email || '',
    phone: contact.phone || '',
    city: contact.city || '',
    company: 'DealzFlow',
  }), [contact]);

  const insertAtCursor = (snippet: string) => {
    const el = taRef.current;
    if (!el) { setBody((b) => b + snippet); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      try { el.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
  };

  const onPickTemplate = (tpl: { body: string; default_media_urls?: string[] }) => {
    const rendered = renderSmsTemplate(tpl.body, renderCtx);
    setBody((b) => (b.trim() ? b + (b.endsWith('\n') ? '' : '\n') + rendered : rendered));
    if (Array.isArray(tpl.default_media_urls)) {
      const adds = tpl.default_media_urls.filter(Boolean).map((url) => ({ url, name: url.split('/').pop() || 'attachment' }));
      if (adds.length) setMedia((m) => [...m, ...adds]);
    }
    setPlusOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const onPickVariable = (tag: string) => {
    insertAtCursor(renderSmsTemplate(tag, renderCtx));
    setPlusOpen(false);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    const uploaded: { url: string; name: string }[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is over 5MB — Twilio MMS limit`);
          continue;
        }
        const path = `${contact.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('crm-sms-media').upload(path, file, {
          cacheControl: '3600', upsert: false, contentType: file.type,
        });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from('crm-sms-media').getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, name: file.name });
      }
      if (uploaded.length) setMedia((m) => [...m, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const name = (contact.first_name || contact.last_name || 'lead').toString();
  const placeholder = `Message ${name.split(' ')[0]}…`;
  // Send is fire-and-forget — never disable on isPending. The optimistic
  // bubble + cleared input give the user "tap, gone" feedback so they can
  // immediately type and send the next message (iMessage parity).
  const canSend = (body.trim().length > 0 || media.length > 0) && !!contact.phone;

  const send = () => {
    if (!body.trim() && media.length === 0) return;
    if (!contact.phone) {
      triggerHaptic('error');
      toast.error('This lead has no phone number');
      return;
    }
    triggerHaptic('medium');
    const quotedPrefix = quote
      ? quote.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
      : '';
    const text = quotedPrefix + body;
    const draftBody = body;
    const draftMedia = media;
    setBody('');
    setQuote(null);
    setMedia([]);
    if (taRef.current) taRef.current.style.height = 'auto';
    onSent?.();
    sendSms.mutate(
      {
        contact_id: contact.id,
        to: contact.phone,
        body: text,
        channel,
        conversation_id: conversationId ?? undefined,
        media_urls: draftMedia.length ? draftMedia.map((m) => m.url) : undefined,
      },
      {
        onError: (err: any) => {
          setBody(draftBody);
          setMedia(draftMedia);
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
        paddingBottom: isNative ? '6px' : 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        paddingTop: '6px',
        transform: isNative
          ? 'none'
          : 'translate3d(0, calc(var(--keyboard-inset-bottom, 0px) * -1), 0)',
        willChange: 'transform',
        // iOS visualViewport.resize only fires at start/end of the keyboard
        // animation, so without a CSS transition the composer would teleport
        // up and "wait" while the keyboard finishes sliding (the lag the
        // user reported in the standalone PWA). Match the iOS spring curve
        // so the composer rides the keyboard naturally.
        transition: 'none',
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
        {media.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {media.map((m, i) => (
              <div key={`${m.url}-${i}`} className="group flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 pl-1 pr-1.5 py-1 text-[12px] text-foreground max-w-[220px]">
                {/\.(png|jpe?g|gif|webp|heic)$/i.test(m.url) ? (
                  <img src={m.url} alt="" className="h-7 w-7 rounded-md object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground ml-1" />
                )}
                <span className="truncate">{m.name}</span>
                <button
                  type="button"
                  onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove attachment"
                  className="shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
            {uploading && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
                <Loader2 className="h-3 w-3 animate-spin" /> uploading…
              </div>
            )}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <div className="flex items-center gap-1.5">
          <Popover open={plusOpen} onOpenChange={setPlusOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Attachments and templates"
                className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={8} className="w-72 p-0 overflow-hidden">
              {plusView === 'menu' && (
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => setPlusView('templates')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" /> Insert template
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
                  >
                    <ImageIcon className="w-4 h-4 text-muted-foreground" /> Attach photo / file
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlusView('variables')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-muted text-left"
                  >
                    <Variable className="w-4 h-4 text-muted-foreground" /> Insert variable
                  </button>
                </div>
              )}

              {plusView === 'templates' && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 border-b border-border/60 px-1.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setPlusView('menu')}
                      aria-label="Back"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="relative flex-1">
                      <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        autoFocus
                        value={tplFilter}
                        onChange={(e) => setTplFilter(e.target.value)}
                        placeholder="Search templates"
                        className="w-full h-7 rounded-md bg-muted/40 pl-7 pr-2 text-[13px] outline-none focus:bg-background border border-transparent focus:border-border"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredTemplates.length === 0 ? (
                      <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                        No templates yet
                      </div>
                    ) : (
                      filteredTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onPickTemplate(t)}
                          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted"
                        >
                          <div className="text-[13px] font-medium truncate">{t.name}</div>
                          <div className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">{t.body}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {plusView === 'variables' && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 border-b border-border/60 px-1.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setPlusView('menu')}
                      aria-label="Back"
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="text-[12px] font-medium text-muted-foreground">Insert variable</div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {SMS_VARIABLES.map((v) => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => onPickVariable(v.tag)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left"
                      >
                        <span className="text-[13px]">{v.label}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{v.tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0 relative flex items-center rounded-full border border-border/60 bg-muted/30 focus-within:bg-background focus-within:border-border transition-colors px-3 py-0 min-h-[32px]">
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
              className="m-textarea flex-1 min-w-0 bg-transparent resize-none outline-none text-[14.5px] leading-[20px] py-0 max-h-[110px] min-h-0 placeholder:text-muted-foreground/55"
            />

            {showCounter && (
              <span className="pointer-events-none absolute right-3 -bottom-4 text-[10px] tabular-nums text-muted-foreground/70">
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
                : 'bg-muted text-muted-foreground/50 cursor-not-allowed active:scale-100')
            }
          >
            <Send className="w-[15px] h-[15px]" />
          </button>
        </div>
      </div>
    </div>
  );
});
