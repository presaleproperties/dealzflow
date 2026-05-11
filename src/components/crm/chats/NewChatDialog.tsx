// NewChatDialog
// ---------------------------------------------------------------------------
// Global "Start New Chat" launcher mounted at the app root. Lets the agent
// pick a contact (from anywhere in the app) and a channel (Text / Email),
// then hands off to the canonical SendTextDialog / ComposeEmailDialog with
// the picked contact pre-loaded. Triggered via `useNewChatStore.open()`.
//
// Important: this REPLACES the old "Send Text" quick-action flow that
// jumped straight into /crm/sms — that surface has been removed; agents
// now start chats from the unified Chats page or this launcher.
import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Mail, Search, X, ArrowLeft } from 'lucide-react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { useNewChatStore } from '@/stores/useNewChatStore';

type Channel = 'text' | 'email';

export function NewChatDialog() {
  const { isOpen, presetContactId, presetChannel, close } = useNewChatStore();
  const { data: contacts = [] } = useCrmContacts();

  const [step, setStep] = useState<'pick' | 'launching'>('pick');
  const [channel, setChannel] = useState<Channel>('text');
  const [picked, setPicked] = useState<CrmContact | null>(null);
  const [query, setQuery] = useState('');

  // Reset / hydrate when the dialog opens or preset changes
  useEffect(() => {
    if (!isOpen) return;
    setStep('pick');
    setQuery('');
    setChannel(presetChannel ?? 'text');
    if (presetContactId) {
      const c = contacts.find((c) => c.id === presetContactId) ?? null;
      setPicked(c);
    } else {
      setPicked(null);
    }
  }, [isOpen, presetContactId, presetChannel, contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 25);
    return contacts
      .filter((c) => {
        const name = formatContactName(c.first_name, c.last_name).toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        const phone = (c.phone ?? '').replace(/\D/g, '');
        const qDigits = q.replace(/\D/g, '');
        return (
          name.includes(q) ||
          email.includes(q) ||
          (qDigits.length >= 3 && phone.includes(qDigits))
        );
      })
      .slice(0, 25);
  }, [contacts, query]);

  // Disable channel toggle when contact lacks the right address
  const canText = !!picked?.phone;
  const canEmail = !!picked?.email;

  const launch = () => {
    if (!picked) return;
    if (channel === 'text' && !canText) return;
    if (channel === 'email' && !canEmail) return;
    setStep('launching');
  };

  // When the inner dialog closes, reset our launcher too
  const handleInnerClose = (next: boolean) => {
    if (!next) {
      setStep('pick');
      close();
    }
  };

  // ── Step 2: hand off to the canonical composer for that channel ──
  if (isOpen && step === 'launching' && picked) {
    if (channel === 'text') {
      return (
        <SendTextDialog
          contact={picked}
          open={true}
          onOpenChange={handleInnerClose}
          initialChannel="sms"
        />
      );
    }
    return (
      <ComposeEmailDialog
        contact={picked}
        open={true}
        onOpenChange={handleInnerClose}
      />
    );
  }

  // ── Step 1: contact + channel picker ──
  return (
    <ResponsiveDialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <ResponsiveDialogContent className="sm:max-w-[460px] p-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <ResponsiveDialogTitle className="text-[17px] font-semibold tracking-tight">
            Start a new chat
          </ResponsiveDialogTitle>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Pick a contact, then choose how to reach them.
          </p>
        </ResponsiveDialogHeader>

        {/* Channel toggle */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60 border border-border/40">
            <ChannelButton
              active={channel === 'text'}
              disabled={!!picked && !canText}
              icon={<MessageSquare className="w-4 h-4" />}
              label="Text"
              onClick={() => setChannel('text')}
            />
            <ChannelButton
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
        </div>

        {/* Picked contact preview */}
        {picked && (
          <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground truncate">
                {formatContactName(picked.first_name, picked.last_name)}
              </div>
              <div className="text-[11.5px] text-muted-foreground truncate">
                {channel === 'text' ? picked.phone || '— no phone —' : picked.email || '— no email —'}
              </div>
            </div>
            <button
              onClick={() => setPicked(null)}
              className="h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
              aria-label="Clear contact"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search + results */}
        {!picked && (
          <div className="px-5 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts by name, email, phone…"
                className="pl-9 h-10 text-[13.5px]"
              />
            </div>
            <div className="mt-3 max-h-[280px] overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
              {filtered.length === 0 ? (
                <div className="px-3 py-8 text-center text-[12.5px] text-muted-foreground">
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
                        <div className="text-[11px] text-muted-foreground truncate">
                          {meta || (channel === 'text' ? 'no phone' : 'no email')}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border/50 bg-muted/20">
          {picked ? (
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)} className="text-muted-foreground">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Change contact
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
            <Button
              size="sm"
              onClick={launch}
              disabled={!picked || (channel === 'text' ? !canText : !canEmail)}
            >
              Start {channel === 'text' ? 'text' : 'email'}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ChannelButton({
  active, disabled, icon, label, onClick,
}: { active: boolean; disabled?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12.5px] font-semibold transition-all',
        active
          ? 'bg-background text-foreground shadow-sm border border-border/60'
          : 'text-muted-foreground hover:text-foreground',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}
