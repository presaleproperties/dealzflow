import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, CheckCircle2, AlertTriangle, XCircle, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TestResult = {
  log_id?: string;
  sid?: string;
  status?: string;
};

type StatusResp = {
  log: {
    id: string;
    status: string;
    twilio_message_sid: string | null;
    to_number: string;
    from_number: string | null;
    channel: string;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
    delivered_at: string | null;
  };
  twilio: {
    sid: string;
    status: string;
    error_code: number | null;
    error_message: string | null;
    date_created: string;
    date_sent: string | null;
    date_updated: string | null;
    price: string | null;
    price_unit: string | null;
  } | null;
  twilio_error: string | null;
};

const STATUS_TONE: Record<string, string> = {
  queued: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  accepted: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  sending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  sent: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  read: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-600 border-red-500/30',
  undelivered: 'bg-red-500/15 text-red-600 border-red-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
  const Icon =
    status === 'delivered' || status === 'read' ? CheckCircle2
    : status === 'failed' || status === 'undelivered' ? XCircle
    : status === 'sent' ? CheckCircle2
    : AlertTriangle;
  return (
    <Badge variant="outline" className={cn('gap-1 capitalize border', tone)}>
      <Icon className="w-3 h-3" /> {status}
    </Badge>
  );
}

export function SendWhatsAppTestCard({ defaultBody = 'Test from DealzFlow ✅' }: { defaultBody?: string }) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState(defaultBody);
  const [result, setResult] = useState<TestResult | null>(null);
  const pollRef = useRef<number | null>(null);

  const send = useMutation({
    mutationFn: async (vars: { to: string; body: string }) => {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: vars.to, body: vars.body, channel: 'whatsapp' },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as TestResult;
    },
    onSuccess: (d) => {
      setResult(d);
      toast.success(`WhatsApp queued · ${d.status ?? 'pending'}${d.sid ? ` · ${d.sid.slice(0, 8)}…` : ''}`);
    },
    onError: (e: Error) => {
      setResult(null);
      toast.error(e.message || 'Send failed');
    },
  });

  const status = useQuery<StatusResp>({
    queryKey: ['msg-test-status', result?.log_id, result?.sid],
    enabled: !!(result?.log_id || result?.sid),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('messaging-test-status', {
        body: { log_id: result?.log_id, sid: result?.sid },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as StatusResp;
    },
    refetchInterval: (q) => {
      const s = (q.state.data as StatusResp | undefined)?.log.status;
      if (!s) return 2000;
      if (['delivered', 'read', 'failed', 'undelivered'].includes(s)) return false;
      return 2500;
    },
  });

  // Stop polling after 90s no matter what
  useEffect(() => {
    if (!result) return;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => status.refetch(), 90_000);
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [result, status]);

  const log = status.data?.log;
  const tw = status.data?.twilio;

  return (
    <Card className="p-4 space-y-3 border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-start gap-3">
        <MessageCircle className="w-4 h-4 mt-0.5 text-emerald-600" />
        <div className="flex-1">
          <div className="font-semibold text-sm">Send WhatsApp test</div>
          <div className="text-xs text-muted-foreground">
            Sends a real message and polls Twilio + webhook delivery until terminal state.
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_2fr] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="wa-test-to" className="text-xs">Recipient (E.164)</Label>
          <Input
            id="wa-test-to"
            placeholder="+17789006978"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-test-body" className="text-xs">Message body</Label>
          <Input
            id="wa-test-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => send.mutate({ to: to.trim(), body: body.trim() })}
          disabled={send.isPending || !to.trim() || !body.trim()}
        >
          {send.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
          Send test
        </Button>
        {result && (
          <Button size="sm" variant="ghost" onClick={() => status.refetch()} disabled={status.isFetching}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', status.isFetching && 'animate-spin')} /> Refresh
          </Button>
        )}
      </div>

      {/* Result panel */}
      {result && (
        <div className="rounded-md border bg-background p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status</span>
              <StatusBadge status={log?.status ?? result.status ?? 'queued'} />
              {tw?.status && tw.status !== log?.status && (
                <span className="text-muted-foreground">
                  Twilio reports <StatusBadge status={tw.status} />
                </span>
              )}
            </div>
            {!log || !['delivered', 'read', 'failed', 'undelivered'].includes(log.status) ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Polling…
              </span>
            ) : null}
          </div>

          {result.sid && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Twilio SID</span>
              <span className="font-mono text-[11px] break-all">{result.sid}</span>
            </div>
          )}
          {log?.from_number && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">From</span>
              <span className="font-mono">{log.from_number}</span>
            </div>
          )}
          {log?.to_number && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">To</span>
              <span className="font-mono">{log.to_number}</span>
            </div>
          )}
          {tw?.price && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Cost</span>
              <span>{tw.price} {tw.price_unit}</span>
            </div>
          )}
          {(log?.error_message || tw?.error_message) && (
            <div className="rounded bg-red-500/10 border border-red-500/30 p-2 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-red-600">
                <XCircle className="w-3 h-3" /> Error {log?.error_code ?? tw?.error_code ?? ''}
              </div>
              <div className="text-foreground">{log?.error_message ?? tw?.error_message}</div>
            </div>
          )}
          {status.data?.twilio_error && !tw && (
            <div className="text-amber-600">Twilio lookup: {status.data.twilio_error}</div>
          )}

          {/* Webhook delivery timeline */}
          <div className="pt-2 border-t mt-2 space-y-1">
            <div className="text-muted-foreground font-medium">Webhook timeline</div>
            <Timeline log={log ?? null} tw={tw ?? null} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Timeline({ log, tw }: { log: StatusResp['log'] | null; tw: StatusResp['twilio'] }) {
  if (!log) return <div className="text-muted-foreground italic">No data yet.</div>;
  const events: Array<{ label: string; at: string | null; ok?: boolean; err?: boolean }> = [
    { label: 'Created', at: log.created_at },
    { label: 'Sent (Twilio)', at: tw?.date_sent ?? null, ok: !!tw?.date_sent },
    { label: 'Last update', at: log.updated_at },
    { label: 'Delivered', at: log.delivered_at, ok: !!log.delivered_at },
  ];
  if (log.status === 'failed' || log.status === 'undelivered') {
    events.push({ label: 'Failed', at: log.updated_at, err: true });
  }
  return (
    <ul className="space-y-0.5">
      {events.filter((e) => e.at).map((e, i) => (
        <li key={i} className="flex justify-between gap-2">
          <span className={cn('flex items-center gap-1', e.err && 'text-red-600', e.ok && 'text-emerald-600')}>
            {e.err ? <XCircle className="w-3 h-3" /> : e.ok ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />}
            {e.label}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {e.at ? new Date(e.at).toLocaleTimeString() : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}
