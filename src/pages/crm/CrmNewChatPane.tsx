// Inline "New Chat" pane — visually mirrors CrmChatThreadPage so the
// transition from picking a lead → typing → seeing the live thread is
// seamless. No popups; everything lives inside the Chats route slot.
//
// Behavior:
//  • Header has a "To:" autocomplete until a contact is picked.
//  • If the picked contact already has ANY existing conversation, we
//    jump straight to that thread (most recent across all channels).
//  • Otherwise we render an empty thread (header + empty messages +
//    InlineTextComposer) identical to a real thread; sending the first
//    message creates the conversation and navigates into it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, X, Search, MessageSquare, Phone, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { formatContactName, formatPhone } from '@/lib/format';
import { InlineTextComposer } from '@/components/crm/chats/InlineTextComposer';
import { supabase } from '@/integrations/supabase/client';

const SMS_COLOR = 'hsl(199 89% 48%)';

export default function CrmNewChatPane() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preContactId = searchParams.get('contactId');
  const { data: contacts = [] } = useCrmContacts();

  const [picked, setPicked] = useState<CrmContact | null>(null);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const toRef = useRef<HTMLInputElement | null>(null);

  // Pre-pick contact from ?contactId= (e.g. Send SMS from lead detail).
  useEffect(() => {
    if (!preContactId || picked) return;
    const match = contacts.find((c) => c.id === preContactId);
    if (match) setPicked(match);
  }, [preContactId, contacts, picked]);

  useEffect(() => { if (!picked) toRef.current?.focus(); }, [picked]);

  // When a contact is picked, check for ANY existing thread and jump in.
  // We look across all channels so "starting a new chat" with someone you
  // already email/SMS just opens that real thread instead of stranding the
  // user in a blank one.
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    setLookingUp(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('crm_conversations')
          .select('id, channel, last_message_at')
          .eq('contact_id', picked.id)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (data?.id) {
          navigate(`/crm/chats/${data.id}`, { replace: true });
          return;
        }
      } catch {
        /* fall through to blank thread */
      } finally {
        if (!cancelled) setLookingUp(false);
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

  // ----- Picker view (no contact yet) -----
  if (!picked) {
    return (
      <div className="flex-1 min-h-0 h-full flex flex-col bg-background">
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 py-2.5">
          <button
            onClick={() => navigate('/crm/chats')}
            className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors md:hidden"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 relative">
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
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[320px] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg divide-y divide-border/40">
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
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-10 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl mb-3 inline-flex items-center justify-center"
               style={{ background: `${SMS_COLOR}15`, border: `1px solid ${SMS_COLOR}40`, color: SMS_COLOR }}>
            <MessageSquare className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">New conversation</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
            Pick a contact above. If you already have a chat with them, we'll open it instead of starting a new one.
          </p>
        </div>
      </div>
    );
  }

  // ----- Blank-thread view (contact picked, no existing conversation) -----
  const name = formatContactName(picked.first_name, picked.last_name) || picked.email || picked.phone || 'Unknown';
  const subline = formatPhone(picked.phone ?? null) || picked.email || 'No phone';

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full bg-background">
      {/* Header — mirrors CrmChatThreadPage exactly */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={() => { setPicked(null); navigate('/crm/chats/new', { replace: true }); }}
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Link
          to={`/crm/leads/${picked.id}`}
          className="flex items-center gap-2.5 min-w-0 flex-1 group"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 ring-1 ring-white/10 shadow-sm"
            style={{ background: `linear-gradient(135deg, ${SMS_COLOR} 0%, ${SMS_COLOR} 100%)`, opacity: 0.9 }}
          >
            {(picked.first_name?.[0] ?? picked.email?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
              {name}
            </h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
              <MessageSquare className="w-3 h-3 shrink-0" style={{ color: SMS_COLOR }} />
              <span className="font-semibold uppercase tracking-wider" style={{ color: SMS_COLOR }}>SMS</span>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span className="truncate">{subline}</span>
            </p>
          </div>
        </Link>
        {picked.phone && (
          <a
            href={`tel:${picked.phone.replace(/\D/g, '')}`}
            aria-label="Call"
            className="h-9 w-9 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10 transition-colors"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
        <Link
          to={`/crm/leads/${picked.id}`}
          aria-label="Lead details"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
        >
          <Info className="w-4 h-4" />
        </Link>
        <button
          onClick={() => { setPicked(null); }}
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
          aria-label="Change contact"
          title="Change contact"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Empty messages area — same styling as a real thread */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-4 bg-muted/10"
        style={{ paddingBottom: 'calc(1rem + var(--keyboard-inset-bottom, 0px))' }}
      >
        <div className="text-center py-16 px-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
               style={{ background: `${SMS_COLOR}15`, border: `1px solid ${SMS_COLOR}40`, color: SMS_COLOR }}>
            <MessageSquare className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {lookingUp ? 'Checking for existing chat…' : 'No messages yet'}
          </p>
          {!lookingUp && (
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
              Send the first SMS to {name.split(' ')[0]} to start this thread.
            </p>
          )}
        </div>
      </div>

      {/* Same composer used inside live threads */}
      <InlineTextComposer
        contact={picked}
        channel="sms"
        conversationId={null}
        onOpenFull={() => { /* full composer not needed in blank thread */ }}
        onSent={async () => {
          // Find the freshly-created conversation and navigate into it.
          for (let i = 0; i < 6; i++) {
            try {
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
            } catch { /* keep polling */ }
            await new Promise((r) => setTimeout(r, 250));
          }
        }}
      />
    </div>
  );
}
