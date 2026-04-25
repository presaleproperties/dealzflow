import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, Activity, ShieldCheck, MessageSquare, Wand2, PowerOff, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CheckStatus = 'ok' | 'warn' | 'fail';
type Check = { id: string; label: string; status: CheckStatus; detail: string };
type StatusResponse = {
  overall: CheckStatus;
  blockers: string[];
  checks: Check[];
  sms_ready: boolean;
  whatsapp_ready: boolean;
  sender: { sms_from: string | null; whatsapp_from: string | null; whatsapp_messaging_service_sid: string | null };
  generated_at: string;
};

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function statusTone(status: CheckStatus) {
  if (status === 'ok') return 'border-emerald-500/30 bg-emerald-500/5';
  if (status === 'warn') return 'border-amber-500/30 bg-amber-500/5';
  return 'border-red-500/30 bg-red-500/5';
}

export function MessagingStatusPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['messaging-status'],
    queryFn: async (): Promise<StatusResponse> => {
      const { data, error } = await supabase.functions.invoke('messaging-status', { body: {} });
      if (error) throw error;
      return data as StatusResponse;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const setup = useMutation({
    mutationFn: async (payload: { action: 'enable' | 'disable'; phone?: string; messaging_service_sid?: string; label?: string }) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-setup', { body: payload });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: (d: unknown) => {
      const result = d as { action?: string; whatsapp_from?: string };
      toast.success(
        result.action === 'disabled'
          ? 'WhatsApp disabled'
          : `WhatsApp enabled${result.whatsapp_from ? ` on ${result.whatsapp_from.replace('whatsapp:', '')}` : ''}`
      );
      qc.invalidateQueries({ queryKey: ['messaging-status'] });
      qc.invalidateQueries({ queryKey: ['sms-settings'] });
      qc.invalidateQueries({ queryKey: ['sms-numbers'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Setup failed'),
  });

  if (isLoading) {
    return (
      <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Running diagnostics…
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 space-y-3 border-red-500/30 bg-red-500/5">
        <div className="flex items-center gap-2 text-sm font-medium text-red-600">
          <XCircle className="w-4 h-4" /> Could not load messaging status
        </div>
        <p className="text-xs text-muted-foreground">{(error as Error)?.message ?? 'Unknown error'}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }

  const overallLabel = data.overall === 'ok' ? 'All systems go' : data.overall === 'warn' ? 'Operational with warnings' : 'Action required';

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={cn('p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border', statusTone(data.overall))}>
        <div className="flex items-center gap-3">
          <StatusIcon status={data.overall} />
          <div>
            <div className="font-semibold text-sm">{overallLabel}</div>
            <div className="text-xs text-muted-foreground">
              Last checked {new Date(data.generated_at).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.sms_ready ? 'default' : 'destructive'} className="gap-1">
            <MessageSquare className="w-3 h-3" /> SMS {data.sms_ready ? 'ready' : 'down'}
          </Badge>
          <Badge variant={data.whatsapp_ready ? 'default' : 'secondary'} className="gap-1">
            <ShieldCheck className="w-3 h-3" /> WhatsApp {data.whatsapp_ready ? 'ready' : 'not ready'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isFetching && 'animate-spin')} /> Re-check
          </Button>
        </div>
      </Card>

      {/* Blockers */}
      {data.blockers.length > 0 && (
        <Card className="p-4 border-red-500/30 bg-red-500/5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <XCircle className="w-4 h-4" /> Why messages won't send
          </div>
          <ul className="text-xs space-y-1 list-disc list-inside text-foreground">
            {data.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </Card>
      )}

      {/* Sender summary */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Activity className="w-3.5 h-3.5" /> Active routes
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground mb-1">SMS sender</div>
            <div className="font-mono text-sm">{data.sender.sms_from ?? <span className="text-muted-foreground italic">none</span>}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground mb-1">WhatsApp sender</div>
            <div className="font-mono text-sm">
              {data.sender.whatsapp_from ?? data.sender.whatsapp_messaging_service_sid ?? <span className="text-muted-foreground italic">none</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Checks */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Diagnostic checks
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
    </div>
  );
}
