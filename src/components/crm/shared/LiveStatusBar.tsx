// Minimal live status bar for Email + SMS sections.
// Renders a single hairline strip: dot · label · detail · "checked Xs ago" · retry.
// Click chevron to expand the per-check breakdown. No icons-by-default — editorial.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type Tone = 'ok' | 'warn' | 'fail' | 'idle';

function Dot({ tone }: { tone: Tone }) {
  const cls =
    tone === 'ok'   ? 'bg-emerald-500'
  : tone === 'warn' ? 'bg-amber-500'
  : tone === 'fail' ? 'bg-red-500'
  :                   'bg-muted-foreground/40';
  return (
    <span className="relative inline-flex w-2 h-2">
      {tone === 'ok' && (
        <span className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping" />
      )}
      <span className={cn('relative w-2 h-2 rounded-full', cls)} />
    </span>
  );
}

function Shell({
  tone, title, detail, lastCheckedAt, isFetching, onRefresh, children,
}: {
  tone: Tone;
  title: string;
  detail?: string;
  lastCheckedAt?: Date | null;
  isFetching?: boolean;
  onRefresh?: () => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const checked = lastCheckedAt ? formatDistanceToNow(lastCheckedAt, { addSuffix: true }) : null;
  return (
    <div
      className={cn(
        'rounded-md border bg-card/40 text-[12.5px]',
        tone === 'fail' && 'border-red-500/30',
        tone === 'warn' && 'border-amber-500/30',
        tone === 'ok'   && 'border-border/60',
      )}
    >
      <button
        type="button"
        onClick={() => children && setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-1.5 text-left',
          children ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <Dot tone={tone} />
        <span className="font-medium text-foreground">{title}</span>
        {detail && (
          <span className="text-muted-foreground truncate">— {detail}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {checked && <span className="hidden sm:inline">checked {checked}</span>}
          {onRefresh && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60"
              aria-label="Re-check"
            >
              {isFetching
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
            </span>
          )}
          {children && (
            <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
          )}
        </span>
      </button>
      {open && children && (
        <div className="border-t border-border/60 px-3 py-2 space-y-1">{children}</div>
      )}
    </div>
  );
}

// ─────────────────────────── Email ───────────────────────────
type GmailStatus = {
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

export function EmailLiveStatusBar() {
  const q = useQuery({
    queryKey: ['email-live-status'],
    queryFn: async (): Promise<GmailStatus> => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', { body: { action: 'status' } });
      if (error) throw error;
      return data as GmailStatus;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const s = q.data;
  let tone: Tone = 'idle';
  let title = 'Checking email…';
  let detail: string | undefined;

  if (q.isLoading) {
    tone = 'idle';
  } else if (q.error || !s) {
    tone = 'fail';
    title = 'Email status unavailable';
    detail = (q.error as Error | null)?.message;
  } else if (!s.connected) {
    tone = 'fail';
    title = 'Email not connected';
    detail = 'Connect Gmail in Settings → Integrations to start sending and syncing.';
  } else if (s.sync?.last_error) {
    tone = 'warn';
    title = 'Email connected — sync issue';
    detail = s.sync.last_error;
  } else {
    tone = 'ok';
    title = 'Email connected';
    const parts: string[] = [];
    if (s.gmailEmail) parts.push(s.gmailEmail);
    if (s.sync?.last_sync_at) parts.push(`last sync ${formatDistanceToNow(new Date(s.sync.last_sync_at), { addSuffix: true })}`);
    detail = parts.join(' · ');
  }

  return (
    <Shell
      tone={tone}
      title={title}
      detail={detail}
      lastCheckedAt={q.dataUpdatedAt ? new Date(q.dataUpdatedAt) : null}
      isFetching={q.isFetching}
      onRefresh={() => q.refetch()}
    >
      {s && (
        <>
          <Row label="Mailbox" value={s.gmailEmail || '—'} />
          <Row label="Initial sync" value={s.sync?.initial_sync_completed ? 'complete' : 'pending'} />
          <Row label="Messages synced" value={s.sync?.total_messages_synced?.toLocaleString() || '0'} />
          <Row label="Last sync" value={s.sync?.last_sync_at ? formatDistanceToNow(new Date(s.sync.last_sync_at), { addSuffix: true }) : 'never'} />
          {s.sync?.last_error && <Row label="Last error" value={s.sync.last_error} tone="warn" />}
        </>
      )}
    </Shell>
  );
}

// ─────────────────────────── SMS ───────────────────────────
type CheckStatus = 'ok' | 'warn' | 'fail';
type Check = { id: string; label: string; status: CheckStatus; detail: string };
type SmsStatus = {
  overall: CheckStatus;
  blockers: string[];
  checks: Check[];
  sms_ready: boolean;
  whatsapp_ready: boolean;
  sender: { sms_from: string | null; whatsapp_from: string | null; whatsapp_messaging_service_sid: string | null };
  generated_at: string;
};

export function SmsLiveStatusBar() {
  const q = useQuery({
    queryKey: ['sms-live-status'],
    queryFn: async (): Promise<SmsStatus> => {
      const { data, error } = await supabase.functions.invoke('messaging-status', { body: {} });
      if (error) throw error;
      return data as SmsStatus;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const s = q.data;
  let tone: Tone = 'idle';
  let title = 'Checking SMS…';
  let detail: string | undefined;

  if (q.isLoading) {
    tone = 'idle';
  } else if (q.error || !s) {
    tone = 'fail';
    title = 'SMS status unavailable';
    detail = (q.error as Error | null)?.message;
  } else if (!s.sms_ready) {
    tone = 'fail';
    title = 'SMS not ready';
    detail = s.blockers[0] || 'Twilio is not configured.';
  } else if (s.overall === 'warn') {
    tone = 'warn';
    title = 'SMS ready — warnings';
    detail = s.checks.find(c => c.status === 'warn')?.detail;
  } else {
    tone = 'ok';
    title = 'SMS ready';
    detail = s.sender.sms_from ? `from ${s.sender.sms_from}` : undefined;
  }

  return (
    <Shell
      tone={tone}
      title={title}
      detail={detail}
      lastCheckedAt={q.dataUpdatedAt ? new Date(q.dataUpdatedAt) : null}
      isFetching={q.isFetching}
      onRefresh={() => q.refetch()}
    >
      {s && (
        <>
          {s.checks.map(c => (
            <Row
              key={c.id}
              label={c.label}
              value={c.detail}
              tone={c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'fail'}
            />
          ))}
        </>
      )}
    </Shell>
  );
}

function Row({ label, value, tone = 'ok' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'fail' }) {
  return (
    <div className="flex items-start gap-3 text-[12px]">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn(
        'flex-1 break-words',
        tone === 'fail' && 'text-red-500',
        tone === 'warn' && 'text-amber-500',
      )}>{value}</span>
    </div>
  );
}
