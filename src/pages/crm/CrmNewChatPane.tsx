// Inline "New Chat" pane that lives inside the Chats page itself.
// Apple-Mail-style "To:" picker with autocomplete + channel toggle, rendered
// in the chats right pane (desktop) or full pane (mobile) — no global popup.
//
// Flow:
//   1. User searches for / picks a contact and chooses a channel.
//   2. We look up an existing crm_conversations row for that contact+channel.
//      • If found → navigate to /crm/chats/:id (carry on the chat).
//      • If none  → open the canonical SendTextDialog / ComposeEmailDialog
//        as the composer. That dialog is the existing approved composer
//        surface; only the picker has been moved into the page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Mail, Search, X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Channel = 'text' | 'email';

export default function CrmNewChatPane() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();

  const [channel, setChannel] = useState<Channel>('text');
  const [picked, setPicked] = useState<CrmContact | null>(null);
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const [composer, setComposer] = useState<null | 'text' | 'email'>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 40);
    const qDigits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      const name = formatContactName(c.first_name, c.last_name).toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      const phone = (c.phone ?? '').replace(/\D/g, '');
      return name.includes(q) || email.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits));
    }).slice(0, 40);
  }, [contacts, query]);

  const canText = !!picked?.phone;
  const canEmail = !!picked?.email;

  // When channel switches, if other channel becomes invalid we keep the pick
  // but disable Continue. When user picks a contact with no email and email
  // is selected, auto-fall-back to text if available — feels native.
  useEffect(() => {
    if (!picked) return;
    if (channel === 'email' && !canEmail && canText) setChannel('text');
    if (channel === 'text' && !canText && canEmail) setChannel('email');
  }, [picked, channel, canEmail, canText]);

  const handleContinue = async () => {
    if (!picked) return;
    if (channel === 'text' && !canText) return;
    if (channel === 'email' && !canEmail) return;
    setOpening(true);
    try {
      const wanted = channel === 'text' ? ['sms', 'whatsapp'] : ['email'];
      const { data, error } = await supabase
        .from('crm_conversations')
        .select('id, channel, last_message_at')
        .eq('contact_id', picked.id)
        .in('channel', wanted)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.id) {
        navigate(`/crm/chats/${data.id}`);
        return;
      }
      // No existing thread — open the canonical composer to start one.
      setComposer(channel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open conversation';
      toast.error(msg);
      setComposer(channel);
    } finally {
      setOpening(false);
    }
  };

  const handleComposerClose = (next: boolean) => {
    if (!next) {
      setComposer(null);
      // Best-effort: jump to the newly created conversation if one was made.
      if (picked) {
        supabase
          .from('crm_conversations')
          .select('id, last_message_at')
          .eq('contact_id', picked.id)
          .in('channel', composer === 'text' ? ['sms', 'whatsapp'] : ['email'])
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => { if (data?.id) navigate(`/crm/chats/${data.id}`); });
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-background">
      {/* Header — mirrors the thread page header */}
      <header className="px-5 md:px-6 pt-4 pb-3 border-b border-border/60 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full md:hidden"
          onClick={() => navigate('/crm/chats')}
          aria-label="Back to chats"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">New chat</h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Pick a contact, then choose how to reach them.
          </p>
        </div>
      </header>

      {/* Composer body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 md:px-6 py-5 max-w-[640px] w-full mx-auto">
        {/* "To:" field */}
        <label className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80 mb-1.5">
          To
        </label>
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-foreground truncate">
                {formatContactName(picked.first_name, picked.last_name)}
              </div>
              <div className="text-[12px] text-muted-foreground truncate">
                {channel === 'text' ? picked.phone || '— no phone —' : picked.email || '— no email —'}
              </div>
            </div>
            <button
              onClick={() => { setPicked(null); setQuery(''); requestAnimationFrame(() => inputRef.current?.focus()); }}
              className="h-8 w-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
              aria-label="Clear contact"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts by name, email, phone…"
                className="pl-9 h-11 text-[14px]"
              />
            </div>
            <div className="mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40">
              {filtered.length === 0 ? (
                <div className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">
                  No contacts match.
                </div>
              ) : (
                filtered.map((c) => {
                  const name = formatContactName(c.first_name, c.last_name);
                  const meta = channel === 'text' ? c.phone : c.email;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPicked(c)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
                        <div className="text-[11.5px] text-muted-foreground truncate">
                          {meta || (channel === 'text' ? 'no phone on file' : 'no email on file')}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Channel toggle */}
        <label className="block mt-6 text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80 mb-1.5">
          Channel
        </label>
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60 border border-border/40">
          <ChannelTab
            active={channel === 'text'}
            disabled={!!picked && !canText}
            icon={<MessageCircle className="w-4 h-4" />}
            label="Text"
            onClick={() => setChannel('text')}
          />
          <ChannelTab
            active={channel === 'email'}
            disabled={!!picked && !canEmail}
            icon={<Mail className="w-4 h-4" />}
            label="Email"
            onClick={() => setChannel('email')}
          />
        </div>
        {picked && channel === 'text' && !canText && (
          <p className="text-[11.5px] text-amber-600 dark:text-amber-400 mt-2">
            {formatContactName(picked.first_name, picked.last_name)} has no phone on file.
          </p>
        )}
        {picked && channel === 'email' && !canEmail && (
          <p className="text-[11.5px] text-amber-600 dark:text-amber-400 mt-2">
            {formatContactName(picked.first_name, picked.last_name)} has no email on file.
          </p>
        )}

        {/* Continue */}
        <div className="mt-7 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/crm/chats')}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleContinue}
            disabled={!picked || opening || (channel === 'text' ? !canText : !canEmail)}
            className="gap-1.5"
          >
            {channel === 'text' ? <MessageSquare className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
            {opening ? 'Opening…' : `Open ${channel === 'text' ? 'text' : 'email'} chat`}
          </Button>
        </div>
      </div>

      {/* Canonical composers — only mounted when starting a brand-new thread */}
      {composer === 'text' && picked && (
        <SendTextDialog
          contact={picked}
          open={true}
          onOpenChange={handleComposerClose}
          initialChannel="sms"
        />
      )}
      {composer === 'email' && picked && (
        <ComposeEmailDialog
          contact={picked}
          open={true}
          onOpenChange={handleComposerClose}
        />
      )}
    </div>
  );
}

function ChannelTab({
  active, disabled, icon, label, onClick,
}: { active: boolean; disabled?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-1.5 h-10 rounded-lg text-[13px] font-semibold transition-all',
        active
          ? 'bg-background text-foreground shadow-sm border border-border/60'
          : 'text-muted-foreground hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
