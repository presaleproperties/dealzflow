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
import { SendWhatsAppTestCard } from './SendWhatsAppTestCard';

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

      {/* WhatsApp Setup */}
      <WhatsAppSetupCard
        smsFrom={data.sender.sms_from}
        whatsappFrom={data.sender.whatsapp_from}
        whatsappReady={data.whatsapp_ready}
        onEnable={(opts) => setup.mutate({ action: 'enable', ...opts })}
        onDisable={() => setup.mutate({ action: 'disable' })}
        pending={setup.isPending}
      />

      {/* WhatsApp test send */}
      <SendWhatsAppTestCard />

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

// ============== WhatsApp Setup Card ==============
function WhatsAppSetupCard({
  smsFrom,
  whatsappFrom,
  whatsappReady,
  onEnable,
  onDisable,
  pending,
}: {
  smsFrom: string | null;
  whatsappFrom: string | null;
  whatsappReady: boolean;
  onEnable: (opts: { phone?: string; messaging_service_sid?: string; label?: string }) => void;
  onDisable: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [msid, setMsid] = useState('');
  const [label, setLabel] = useState('DealzFlow WhatsApp');

  const targetPhone = smsFrom ?? '(no SMS number on file)';

  return (
    <Card className={cn('p-4 space-y-3 border', whatsappReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-primary/30 bg-primary/5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Wand2 className="w-4 h-4 mt-0.5 text-primary" />
          <div>
            <div className="font-semibold text-sm">WhatsApp setup</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {whatsappReady
                ? <>Live on <span className="font-mono">{whatsappFrom}</span>.</>
                : <>One click enables WhatsApp on your existing SMS number <span className="font-mono">{targetPhone}</span> and inserts the channel row.</>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!whatsappReady && (
          <Button size="sm" onClick={() => onEnable({})} disabled={pending || !smsFrom}>
            {pending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
            Enable on {smsFrom ?? 'SMS number'}
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings2 className="w-3.5 h-3.5 mr-1.5" />
              {whatsappReady ? 'Reconfigure' : 'Use a different number'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>WhatsApp sender</DialogTitle>
              <DialogDescription>
                Provide a phone number or a Twilio Messaging Service SID. Phone is in E.164 format (e.g. <code>+17789006978</code>) — no <code>whatsapp:</code> prefix needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wa-phone" className="text-xs">Phone number (E.164)</Label>
                <Input id="wa-phone" placeholder={smsFrom ?? '+17789006978'} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-label" className="text-xs">Display label</Label>
                <Input id="wa-label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-msid" className="text-xs">Messaging Service SID (optional)</Label>
                <Input id="wa-msid" placeholder="MGxxxxxxxxxxxxxxxx" value={msid} onChange={(e) => setMsid(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  onEnable({
                    phone: phone.trim() || undefined,
                    messaging_service_sid: msid.trim() || undefined,
                    label: label.trim() || undefined,
                  });
                  setOpen(false);
                }}
                disabled={pending || (!phone.trim() && !msid.trim())}
              >
                {pending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {whatsappReady && (
          <Button size="sm" variant="ghost" onClick={onDisable} disabled={pending} className="text-muted-foreground">
            <PowerOff className="w-3.5 h-3.5 mr-1.5" /> Disable
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        This only configures the app side. You still need an <strong>approved WhatsApp Sender</strong> in Twilio
        (or join the sandbox <code>+14155238886</code>) for messages to actually deliver.
      </p>
    </Card>
  );
}
