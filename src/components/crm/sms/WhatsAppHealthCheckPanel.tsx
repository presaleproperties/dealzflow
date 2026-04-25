import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, ShieldCheck,
  Send, Lock, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'warn' | 'fail';
type Check = { id: string; label: string; status: Status; detail: string };
type PreflightResp = {
  ok: boolean;
  blockers: string[];
  checks: Check[];
  resolved: { whatsapp_from: string | null; e164: string | null; is_sandbox: boolean; approved_sender: boolean };
  generated_at: string;
};

function StatusIcon({ status }: { status: Status }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

export function WhatsAppHealthCheckPanel() {
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [body, setBody] = useState('Health check from DealzFlow ✅');
  const [lastSend, setLastSend] = useState<{ sid?: string; status?: string; log_id?: string } | null>(null);

  const preflight = useQuery({
    queryKey: ['whatsapp-preflight'],
    queryFn: async (): Promise<PreflightResp> => {
      const { data, error } = await supabase.functions.invoke('whatsapp-preflight', { body: {} });
      if (error) throw error;
      return data as PreflightResp;
    },
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const send = useMutation({
    mutationFn: async (vars: { to: string; body: string }) => {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: vars.to, body: vars.body, channel: 'whatsapp' },
      });
      if (error) throw error;
      const d = data as { error?: string; sid?: string; status?: string; log_id?: string };
      if (d.error) throw new Error(d.error);
      return d;
    },
    onSuccess: (d) => {
      setLastSend(d);
      toast.success(`Sent · ${d.status ?? 'queued'}${d.sid ? ` · ${d.sid.slice(0, 8)}…` : ''}`);
      qc.invalidateQueries({ queryKey: ['messaging-status'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Send blocked'),
  });

  const data = preflight.data;
  const sendsAllowed = !!data?.ok && !data.resolved.is_sandbox; // sandbox = warn only, still allowed
  const sendsAllowedSandbox = !!data?.ok; // sandbox sends are still permitted

  if (preflight.isLoading) {
    return (
      <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Running WhatsApp preflight…
      </Card>
    );
  }

  if (preflight.error || !data) {
    return (
      <Card className="p-6 space-y-3 border-red-500/30 bg-red-500/5">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
          <XCircle className="w-4 h-4" /> Preflight failed
        </div>
        <p className="text-xs text-muted-foreground">{(preflight.error as Error)?.message ?? 'Unknown error'}</p>
        <Button size="sm" variant="outline" onClick={() => preflight.refetch()}>Retry</Button>
      </Card>
    );
  }

  const overall: Status = data.ok ? (data.resolved.is_sandbox ? 'warn' : 'ok') : 'fail';

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={cn(
        'p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border',
        overall === 'ok' && 'border-emerald-500/30 bg-emerald-500/5',
        overall === 'warn' && 'border-amber-500/30 bg-amber-500/5',
        overall === 'fail' && 'border-red-500/30 bg-red-500/5',
      )}>
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">
              {overall === 'ok' && 'Cleared for WhatsApp sends'}
              {overall === 'warn' && 'Sandbox only — recipients must opt in'}
              {overall === 'fail' && 'Blocked — fix the issues below before sending'}
            </div>
            <div className="text-xs text-muted-foreground">
              Sender:{' '}
              <span className="font-mono">{data.resolved.whatsapp_from ?? 'not configured'}</span>
              {' · '}
              {data.resolved.is_sandbox ? 'Twilio sandbox' : data.resolved.approved_sender ? 'Approved Sender' : 'Unverified'}
              {' · checked '} {new Date(data.generated_at).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.ok ? 'default' : 'destructive'} className="gap-1">
            {data.ok ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {data.ok ? 'Sends unlocked' : 'Sends locked'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => preflight.refetch()} disabled={preflight.isFetching}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', preflight.isFetching && 'animate-spin')} />
            Re-run
          </Button>
        </div>
      </Card>

      {/* Blockers */}
      {data.blockers.length > 0 && (
        <Card className="p-4 border-red-500/30 bg-red-500/5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <XCircle className="w-4 h-4" /> Why sends are blocked
          </div>
          <ul className="text-xs space-y-1 list-disc list-inside text-foreground">
            {data.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </Card>
      )}

      {/* Checks */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preflight checks
        </div>
        <div className="divide-y">
          {data.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-3 px-4 py-3">
              <StatusIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground break-words">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Gated test send */}
      <Card className={cn('p-4 space-y-3 border', sendsAllowedSandbox ? 'border-primary/30 bg-primary/5' : 'border-muted')}>
        <div className="flex items-start gap-3">
          {sendsAllowedSandbox ? <Unlock className="w-4 h-4 mt-0.5 text-primary" /> : <Lock className="w-4 h-4 mt-0.5 text-muted-foreground" />}
          <div className="flex-1">
            <div className="font-semibold text-sm">Send a verified test</div>
            <div className="text-xs text-muted-foreground">
              {sendsAllowedSandbox
                ? sendsAllowed
                  ? 'All checks green — fire a real WhatsApp message through the configured Sender.'
                  : 'Sandbox path: the recipient must have joined your Twilio sandbox first.'
                : 'Send button disabled until preflight passes.'}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_2fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="hc-to" className="text-xs">Recipient (E.164)</Label>
            <Input id="hc-to" placeholder="+17789006978" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hc-body" className="text-xs">Message body</Label>
            <Input id="hc-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => send.mutate({ to: to.trim(), body: body.trim() })}
          disabled={!sendsAllowedSandbox || send.isPending || !to.trim() || !body.trim()}
        >
          {send.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
          {sendsAllowedSandbox ? 'Send verified test' : 'Sends locked'}
        </Button>

        {lastSend && (
          <div className="text-xs rounded-md border bg-background p-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium capitalize">{lastSend.status ?? 'queued'}</span>
            </div>
            {lastSend.sid && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Twilio SID</span>
                <span className="font-mono text-[11px] break-all">{lastSend.sid}</span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
