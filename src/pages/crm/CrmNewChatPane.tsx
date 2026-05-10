// Inline "New Chat" pane — feels like opening a blank thread inside the
// Chats page. No popups: header has a "To:" autocomplete, body shows the
// (empty) conversation, footer is a normal chat composer. Sending the first
// message creates the conversation and navigates straight into it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, X, Search, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { useSendSms } from '@/hooks/useSms';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function CrmNewChatPane() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preContactId = searchParams.get('contactId');
  const { data: contacts = [] } = useCrmContacts();
  const sendSms = useSendSms();

  const [picked, setPicked] = useState<CrmContact | null>(null);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [body, setBody] = useState('');

  const toRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Pre-pick contact from ?contactId= (e.g. Send SMS button on lead detail).
  useEffect(() => {
    if (!preContactId || picked) return;
    const match = contacts.find((c) => c.id === preContactId);
    if (match) setPicked(match);
  }, [preContactId, contacts, picked]);

  useEffect(() => { if (!picked) toRef.current?.focus(); }, [picked]);
  // When a contact is picked, check for an existing SMS/WhatsApp thread and
  // jump straight into it — feels native: "starting a new chat" with someone
  // you already talk to just opens the existing conversation.
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('crm_conversations')
          .select('id, last_message_at')
          .eq('contact_id', picked.id)
          .in('channel', ['sms', 'whatsapp'])
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (data?.id) {
          navigate(`/crm/chats/${data.id}`, { replace: true });
          return;
        }
        bodyRef.current?.focus();
      } catch {
        bodyRef.current?.focus();
      }
    })();
    return () => { cancelled = true; };
  }, [picked, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    const qDigits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      const name = formatContactName(c.first_name, c.last_name).toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      const phone = (c.phone ?? '').replace(/\D/g, '');
      return name.includes(q) || email.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits));
    }).slice(0, 30);
  }, [contacts, query]);

  const canSend = !!picked?.phone && body.trim().length > 0 && !sendSms.isPending;

  // Auto-grow textarea
  useEffect(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, ta.scrollHeight) + 'px';
  }, [body]);

  const handleSend = () => {
    if (!picked) {
      toast.error('Pick a contact first');
      toRef.current?.focus();
      return;
    }
    if (!picked.phone) {
      toast.error('This contact has no phone number');
      return;
    }
    const text = body.trim();
    if (!text) return;

    sendSms.mutate(
      {
        contact_id: picked.id,
        to: picked.phone,
        body: text,
        channel: 'sms',
      },
      {
        onSuccess: async () => {
          setBody('');
          // Find (or wait briefly for) the conversation row and navigate to it.
          try {
            for (let i = 0; i < 4; i++) {
              const { data } = await supabase
                .from('crm_conversations')
                .select('id, last_message_at')
                .eq('contact_id', picked.id)
                .in('channel', ['sms', 'whatsapp'])
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
              if (data?.id) {
                navigate(`/crm/chats/${data.id}`);
                return;
              }
              await new Promise((r) => setTimeout(r, 250));
            }
          } catch {
            /* swallow — message was sent successfully */
          }
        },
      }
    );
  };

  const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) handleSend();
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-background">
      {/* Header: back + To field */}
      <header className="px-3 sm:px-4 pt-3 pb-2 border-b border-border/60 flex items-center gap-2 bg-background/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full md:hidden shrink-0"
          onClick={() => navigate('/crm/chats')}
          aria-label="Back to chats"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0 relative">
          {picked ? (
            <div className="flex items-center gap-2 h-9">
              <span className="text-[12px] text-muted-foreground shrink-0">To:</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 pl-2.5 pr-1 py-1 text-[13px] font-semibold text-foreground max-w-full">
                <span className="truncate">{formatContactName(picked.first_name, picked.last_name)}</span>
                <span className="text-muted-foreground font-normal text-[11.5px] truncate">
                  · {picked.phone || 'no phone'}
                </span>
                <button
                  onClick={() => { setPicked(null); setQuery(''); requestAnimationFrame(() => toRef.current?.focus()); }}
                  className="h-5 w-5 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  aria-label="Clear contact"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground shrink-0">To:</span>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
                  <Input
                    ref={toRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 150)}
                    placeholder="Search contacts by name, email, phone…"
                    className="pl-8 h-9 text-[13.5px]"
                  />
                </div>
              </div>
              {showResults && (
                <div className="absolute left-[calc(1.5rem+8px)] right-0 top-[calc(100%+4px)] z-30 max-h-[320px] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg divide-y divide-border/40">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                      No contacts match.
                    </div>
                  ) : (
                    filtered.map((c) => {
                      const name = formatContactName(c.first_name, c.last_name);
                      return (
                        <button
                          key={c.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setPicked(c); setQuery(''); setShowResults(false); }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
                            <div className="text-[11.5px] text-muted-foreground truncate">
                              {c.phone || c.email || 'no phone or email'}
                            </div>
                          </div>
                          {!c.phone && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
                              no phone
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {/* Empty conversation body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-10 flex flex-col items-center justify-center text-center">
        <div className={cn(
          'w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 grid place-items-center mb-4',
        )}>
          <MessageCircle className="w-6 h-6 text-primary" strokeWidth={1.6} />
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground mb-1">
          {picked ? 'Say hi' : 'New conversation'}
        </h2>
        <p className="text-[12.5px] text-muted-foreground max-w-[320px] leading-relaxed">
          {picked
            ? `Type your message below. The thread will appear in Chats once you send.`
            : `Pick a contact at the top, then write your first text below.`}
        </p>
        {picked && !picked.phone && (
          <p className="mt-3 text-[12px] text-amber-600 dark:text-amber-400">
            This contact has no phone number on file.
          </p>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/95 backdrop-blur-sm px-3 sm:px-4 py-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onBodyKeyDown}
            placeholder={picked ? 'Message…' : 'Pick a contact first'}
            disabled={!picked}
            rows={1}
            className="min-h-[42px] max-h-[180px] resize-none py-2.5 text-[14px] rounded-2xl"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            className="h-10 w-10 rounded-full shrink-0"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground mt-1.5 px-1">
          Press <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/40 text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/40 text-[10px]">Shift</kbd>+<kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border/40 text-[10px]">Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
