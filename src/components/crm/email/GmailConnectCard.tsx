// Gmail OAuth connect card (per-user). Reuses google-calendar OAuth client.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Loader2, RefreshCcw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type Status = {
  connected: boolean;
  gmailEmail: string | null;
  sync: {
    initial_sync_completed: boolean | null;
    last_sync_at: string | null;
    total_messages_synced: number | null;
    last_error: string | null;
    watch_expires_at: string | null;
  } | null;
};

export default function GmailConnectCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setStatus(data as Status);
    } catch (e: any) {
      console.error('gmail status err', e);
      setStatus({ connected: false, gmailEmail: null, sync: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Handle redirect-back ?gmail_auth=success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gmail_auth');
    if (result === 'success') {
      toast.success('Gmail connected — initial sync running');
      params.delete('gmail_auth');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
      refresh();
    } else if (result === 'error') {
      toast.error(`Gmail connect failed: ${params.get('message') ?? 'unknown'}`);
      params.delete('gmail_auth'); params.delete('message');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
  }, []);

  const connect = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'get_auth_url', redirectUrl: window.location.href.split('?')[0] },
      });
      if (error) throw error;
      if (data?.authUrl) window.location.href = data.authUrl;
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not start Gmail connect');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Gmail? Synced messages will remain but new mail will stop syncing.')) return;
    try {
      setBusy(true);
      const { error } = await supabase.functions.invoke('gmail-auth', { body: { action: 'disconnect' } });
      if (error) throw error;
      toast.success('Gmail disconnected');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.functions.invoke('gmail-sync', { body: {} });
      if (error) throw error;
      toast.success('Sync started');
      setTimeout(refresh, 1500);
    } catch (e: any) {
      toast.error(e?.message ?? 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border border-border/60 bg-muted/20">
      <div className="p-2 rounded-md bg-primary/10 shrink-0">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground">Gmail (Inbox sync)</span>
          {loading ? (
            <Badge variant="outline" className="text-[10px]">Checking…</Badge>
          ) : status?.connected ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Connected</Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Not Connected</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Sync replies, conversations and lead engagement from your Gmail inbox.
        </p>
        {status?.connected && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div><span className="text-foreground/80">{status.gmailEmail ?? '—'}</span></div>
            <div>
              {status.sync?.last_sync_at
                ? `Last sync ${formatDistanceToNow(new Date(status.sync.last_sync_at), { addSuffix: true })}`
                : 'No sync yet'} · {status.sync?.total_messages_synced ?? 0} messages
              {status.sync?.initial_sync_completed === false && ' · initial sync running…'}
            </div>
            {status.sync?.last_error && (
              <div className="text-destructive">Error: {status.sync.last_error}</div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {status?.connected ? (
            <>
              <Button size="sm" variant="outline" onClick={sync} disabled={busy} className="h-7 text-xs gap-1.5">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                Sync now
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy} className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive">
                <Unplug className="h-3 w-3" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={connect} disabled={busy || loading} className="h-7 text-xs gap-1.5">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              Connect Gmail
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
