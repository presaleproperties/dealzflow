import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Inbox, Check, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

type Status = {
  connected: boolean;
  gmailEmail: string | null;
};

/**
 * StepConnectInbox — one-click Gmail / Workspace inbox connect.
 * Pre-fills `login_hint` with the user's auth email so Google skips the
 * account picker and lands the agent straight on the consent screen.
 * After OAuth, every send/reply lives in the agent's own inbox and routes
 * notifications privately to them.
 */
export function StepConnectInbox({ eyebrow, onBack, onNext, onSkip }: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setChecking(true);
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setStatus({
        connected: !!(data as any)?.connected,
        gmailEmail: (data as any)?.gmailEmail ?? null,
      });
    } catch {
      setStatus({ connected: false, gmailEmail: null });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Catch ?gmail_auth=success on return from OAuth and refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gmail_auth');
    if (result === 'success') {
      toast.success('Inbox connected — initial sync running');
      params.delete('gmail_auth');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
      refresh();
    } else if (result === 'error') {
      toast.error(`Inbox connect failed: ${params.get('message') ?? 'unknown error'}`);
      params.delete('gmail_auth'); params.delete('message');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
  }, []);

  const connect = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: {
          action: 'get_auth_url',
          redirectUrl: window.location.href.split('?')[0],
          loginHint: user?.email ?? undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.authUrl) window.location.href = (data as any).authUrl;
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not start inbox connect');
    } finally {
      setBusy(false);
    }
  };

  const isConnected = status?.connected === true;

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Connect your inbox"
      subtitle="One click to plug in your @presaleproperties.com mailbox. Every email you send and every reply you receive stays in your private inbox — only you and the owner see them."
      primaryLabel={isConnected ? 'Continue' : 'Skip for now'}
      onBack={onBack}
      onSkip={isConnected ? undefined : onSkip}
      skipLabel="Skip for now"
      onPrimary={isConnected ? onNext : onSkip}
    >
      <div className="space-y-4">
        {isConnected ? (
          <div className="p-4 rounded-xl bg-success/10 border border-success/20 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success">Inbox connected</p>
              <p className="text-xs text-muted-foreground truncate">
                {status?.gmailEmail ?? user?.email ?? 'Your mailbox is syncing in the background.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 rounded-xl border border-border/60 bg-card/50 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Inbox className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold mb-0.5">
                  {user?.email ? `Connect ${user.email}` : 'Connect your Workspace inbox'}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We'll open Google, you click <strong className="text-foreground">Allow</strong>, and you're done. Outbound sends use this address; replies land here automatically.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                <span>Send & receive directly from your real email — no forwarding aliases.</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                <span>Your inbox is private — other agents never see your conversations.</span>
              </li>
            </ul>

            <Button
              onClick={connect}
              disabled={busy || checking}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy || checking ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              {checking ? 'Checking…' : busy ? 'Opening Google…' : 'Connect inbox with one click'}
            </Button>
          </>
        )}
      </div>
    </StepShell>
  );
}
