import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllSmsLog, type MessagingChannel } from '@/hooks/useSms';
import {
  CheckCircle2, Clock, XCircle, Send, Search, Copy, RefreshCw, Inbox, AlertTriangle, ShieldCheck, Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type Tone = 'emerald' | 'primary' | 'amber' | 'red' | 'muted';

function statusMeta(status: string): { label: string; tone: Tone; Icon: any } {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'read') return { label: 'Delivered', tone: 'emerald', Icon: CheckCircle2 };
  if (s === 'sent') return { label: 'Sent', tone: 'primary', Icon: Send };
  if (s === 'queued' || s === 'accepted' || s === 'sending' || s === 'scheduled')
    return { label: status || 'Queued', tone: 'amber', Icon: Clock };
  if (s === 'failed' || s === 'undelivered') return { label: status || 'Failed', tone: 'red', Icon: XCircle };
  if (s === 'received') return { label: 'Inbound', tone: 'primary', Icon: Inbox };
  return { label: status || 'Unknown', tone: 'muted', Icon: AlertTriangle };
}

const toneClass: Record<Tone, string> = {
  emerald: 'text-emerald-600 border-emerald-600/30 bg-emerald-500/5',
  primary: 'text-primary border-primary/30 bg-primary/5',
  amber: 'text-amber-600 border-amber-600/30 bg-amber-500/5',
  red: 'text-red-600 border-red-600/30 bg-red-500/5',
  muted: 'text-muted-foreground border-border bg-muted/30',
};

function copy(text: string, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  try {
    return format(new Date(ts), 'MMM d, h:mm:ss a');
  } catch {
    return '—';
  }
}

export function DeliveryStatusPanel({ channel }: { channel: MessagingChannel }) {
  const qc = useQueryClient();
  const { data: logs = [], isLoading, refetch } = useAllSmsLog({ limit: 200, channel });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'queued' | 'sent' | 'delivered' | 'failed'>('all');
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<any | null>(null);

  const outbound = useMemo(() => logs.filter(l => l.direction === 'outbound'), [logs]);

  const filtered = useMemo(() => {
    return outbound.filter(l => {
      const s = (l.status || '').toLowerCase();
      if (statusFilter === 'queued' && !['queued', 'accepted', 'sending', 'scheduled'].includes(s)) return false;
      if (statusFilter === 'sent' && s !== 'sent') return false;
      if (statusFilter === 'delivered' && !['delivered', 'read'].includes(s)) return false;
      if (statusFilter === 'failed' && !['failed', 'undelivered'].includes(s)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${l.to_number || ''} ${l.from_number || ''} ${l.body || ''} ${l.twilio_message_sid || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [outbound, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: outbound.length, queued: 0, sent: 0, delivered: 0, failed: 0 };
    outbound.forEach(l => {
      const s = (l.status || '').toLowerCase();
      if (['queued', 'accepted', 'sending', 'scheduled'].includes(s)) c.queued++;
      else if (s === 'sent') c.sent++;
      else if (['delivered', 'read'].includes(s)) c.delivered++;
      else if (['failed', 'undelivered'].includes(s)) c.failed++;
    });
    return c;
  }, [outbound]);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['sms-log-all'] });
    refetch();
    toast.success('Refreshed');
  };

  const handleVerify = async (sid?: string) => {
    setVerifying(true);
    setVerification(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-sms-delivery', {
        body: sid ? { sid } : {},
      });
      if (error) throw error;
      setVerification(data);
      qc.invalidateQueries({ queryKey: ['sms-log-all'] });
      if (data?.ok) {
        toast.success(`Verified — Twilio status: ${data.twilio?.status || data.verdict}`);
      } else {
        toast.error(`Verification failed: ${data?.checks?.find((c: any) => !c.pass)?.detail || 'unknown'}`);
      }
    } catch (e: any) {
      toast.error(`Verify failed: ${e?.message || e}`);
      setVerification({ ok: false, stage: 'invoke', error: e?.message || String(e) });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Delivery Status
              <Badge variant="outline" className="text-[10px] font-normal">Twilio live</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time queued → sent → delivered timeline for every outbound message.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleVerify()}
              disabled={verifying}
              className="gap-1.5"
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Verify last test
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Quick filter pills with counts */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: 'all', label: 'All', count: counts.total, tone: 'muted' as Tone },
            { key: 'queued', label: 'Queued', count: counts.queued, tone: 'amber' as Tone },
            { key: 'sent', label: 'Sent', count: counts.sent, tone: 'primary' as Tone },
            { key: 'delivered', label: 'Delivered', count: counts.delivered, tone: 'emerald' as Tone },
            { key: 'failed', label: 'Failed', count: counts.failed, tone: 'red' as Tone },
          ] as const).map(p => (
            <button
              key={p.key}
              onClick={() => setStatusFilter(p.key as any)}
              className={cn(
                'px-2.5 py-1 text-[11px] rounded-md border transition-colors flex items-center gap-1.5',
                statusFilter === p.key
                  ? toneClass[p.tone] + ' font-semibold'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              )}
            >
              {p.label}
              <span className="opacity-70">{p.count}</span>
            </button>
          ))}
          <div className="relative ml-auto flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search number, body, or SID…"
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Verification result */}
      {verification && (
        <div className={cn(
          'p-3 border-b border-border',
          verification.ok ? 'bg-emerald-500/5' : 'bg-red-500/5'
        )}>
          <div className="flex items-start gap-2">
            {verification.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-xs font-semibold">
                {verification.ok
                  ? `✅ End-to-end verified — verdict: ${verification.verdict}`
                  : `❌ Verification failed${verification.stage ? ` at "${verification.stage}"` : ''}`}
              </div>
              {verification.checks && (
                <ul className="space-y-1">
                  {verification.checks.map((c: any, i: number) => (
                    <li key={i} className="text-[11px] flex items-start gap-1.5">
                      {c.pass ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <span className={cn(c.pass ? 'text-foreground' : 'text-red-700 dark:text-red-400')}>
                        <strong>{c.name}</strong>
                        {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {verification.twilio && (
                <div className="text-[10px] font-mono bg-background/60 rounded p-2 space-y-0.5 text-muted-foreground">
                  <div><span className="opacity-70">SID:</span> {verification.twilio.sid}</div>
                  <div><span className="opacity-70">Status:</span> <span className="text-foreground font-semibold">{verification.twilio.status}</span></div>
                  <div><span className="opacity-70">From → To:</span> {verification.twilio.from} → {verification.twilio.to}</div>
                  {verification.twilio.date_sent && <div><span className="opacity-70">Date sent:</span> {verification.twilio.date_sent}</div>}
                  {verification.twilio.price && <div><span className="opacity-70">Cost:</span> {verification.twilio.price} {verification.twilio.price_unit?.toUpperCase()}</div>}
                </div>
              )}
              {verification.error && (
                <div className="text-[11px] text-red-600">{verification.error}</div>
              )}
            </div>
            <button
              onClick={() => setVerification(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <ScrollArea className="h-[520px]">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {outbound.length === 0
              ? 'No outbound messages yet. Send a test from the Inbox to see it appear here in real time.'
              : 'No messages match your filter.'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map(log => {
              const meta = statusMeta(log.status);
              const Icon = meta.Icon;
              const sid = log.twilio_message_sid;
              return (
                <li key={log.id} className="p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Status badge */}
                    <Badge variant="outline" className={cn('gap-1 text-[10px] shrink-0 mt-0.5', toneClass[meta.tone])}>
                      <Icon className={cn('w-3 h-3', (meta.label === 'Sending' || meta.label === 'Queued') && 'animate-pulse')} />
                      {meta.label}
                    </Badge>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Header row */}
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-mono font-medium text-foreground">{log.to_number}</span>
                        <span className="text-muted-foreground">←</span>
                        <span className="font-mono text-muted-foreground">{log.from_number || '—'}</span>
                        {log.message_type === 'mms' && (
                          <Badge variant="outline" className="text-[9px] px-1 h-4">MMS</Badge>
                        )}
                        {log.num_segments && log.num_segments > 1 && (
                          <span className="text-[10px] text-muted-foreground">{log.num_segments} segs</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto" title={fmt(log.sent_at)}>
                          {formatDistanceToNow(new Date(log.sent_at), { addSuffix: true })}
                        </span>
                      </div>

                      {/* Body preview */}
                      {log.body && (
                        <p className="text-xs text-foreground/80 line-clamp-2 leading-snug">
                          {log.body}
                        </p>
                      )}

                      {/* Timeline */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span className="uppercase tracking-wider opacity-70">Queued</span>
                          <span className="font-mono">{fmt(log.created_at)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Send className="w-2.5 h-2.5" />
                          <span className="uppercase tracking-wider opacity-70">Sent</span>
                          <span className="font-mono">{fmt(log.sent_at)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span className="uppercase tracking-wider opacity-70">Delivered</span>
                          <span className="font-mono">{fmt(log.delivered_at)}</span>
                        </span>
                      </div>

                      {/* SID + error */}
                      <div className="flex flex-wrap items-center gap-2">
                        {sid ? (
                          <>
                            <button
                              onClick={() => copy(sid, 'Twilio SID copied')}
                              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy Twilio Message SID"
                            >
                              <Copy className="w-2.5 h-2.5" />
                              {sid}
                            </button>
                            <button
                              onClick={() => handleVerify(sid)}
                              disabled={verifying}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              title="Verify with Twilio"
                            >
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Verify
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">No SID yet</span>
                        )}
                        {log.error_code && (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-600/30 gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Code {log.error_code}
                          </Badge>
                        )}
                        {log.error_message && (
                          <span className="text-[10px] text-red-600">{log.error_message}</span>
                        )}
                        {log.price && (
                          <span className="text-[10px] text-muted-foreground">
                            {log.price} {log.price_unit?.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </Card>
  );
}
