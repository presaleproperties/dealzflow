import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Mail, MessageSquare, Eye, Clock, TrendingUp } from 'lucide-react';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog } from '@/hooks/useCrmContactSmsLog';
import { cn } from '@/lib/utils';

interface Props {
  contactId: string;
}

/**
 * Compact horizontal metrics strip showing conversation health at a glance:
 * sends/opens, response rate, last contact, last reply.
 */
export function ConversationHealthStrip({ contactId }: Props) {
  const { data: emails = [] } = useCrmEmailLog(contactId);
  const { data: sms = [] } = useCrmContactSmsLog(contactId);

  const metrics = useMemo(() => {
    const allEmails = (emails as any[]) ?? [];
    const allSms = (sms as any[]) ?? [];

    const outboundEmails = allEmails.filter((e) => e.direction === 'outbound');
    const inboundEmails = allEmails.filter((e) => e.direction === 'inbound');
    const outboundSms = allSms.filter((s) => s.direction === 'outbound');
    const inboundSms = allSms.filter((s) => s.direction === 'inbound');

    const opens = outboundEmails.reduce((sum, e) => sum + (e.open_count ?? 0), 0);
    const openedSends = outboundEmails.filter((e) => (e.open_count ?? 0) > 0).length;
    const openRate = outboundEmails.length
      ? Math.round((openedSends / outboundEmails.length) * 100)
      : null;

    const totalOut = outboundEmails.length + outboundSms.length;
    const totalIn = inboundEmails.length + inboundSms.length;
    const replyRate = totalOut ? Math.round((totalIn / totalOut) * 100) : null;

    const allTs = [
      ...allEmails.map((e: any) => e.sent_at),
      ...allSms.map((s: any) => s.sent_at ?? s.created_at),
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a);

    const inboundTs = [
      ...inboundEmails.map((e: any) => e.sent_at),
      ...inboundSms.map((s: any) => s.sent_at ?? s.created_at),
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a);

    return {
      sends: outboundEmails.length + outboundSms.length,
      opens,
      openRate,
      replyRate,
      lastContact: allTs[0] ? new Date(allTs[0]) : null,
      lastReply: inboundTs[0] ? new Date(inboundTs[0]) : null,
    };
  }, [emails, sms]);

  const tone = (rate: number | null) => {
    if (rate == null) return 'text-muted-foreground';
    if (rate >= 50) return 'text-emerald-600';
    if (rate >= 20) return 'text-amber-600';
    return 'text-rose-600';
  };

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
        <Pill
          icon={<Mail className="w-3 h-3" />}
          label="Sends"
          value={metrics.sends.toString()}
          sub={metrics.opens > 0 ? `${metrics.opens} opens` : null}
        />
        <Pill
          icon={<Eye className="w-3 h-3" />}
          label="Open rate"
          value={metrics.openRate == null ? '—' : `${metrics.openRate}%`}
          valueClass={tone(metrics.openRate)}
        />
        <Pill
          icon={<TrendingUp className="w-3 h-3" />}
          label="Reply rate"
          value={metrics.replyRate == null ? '—' : `${metrics.replyRate}%`}
          valueClass={tone(metrics.replyRate)}
        />
        <Pill
          icon={<Clock className="w-3 h-3" />}
          label="Last contact"
          value={
            metrics.lastContact
              ? formatDistanceToNow(metrics.lastContact, { addSuffix: false })
              : 'Never'
          }
          sub={
            metrics.lastReply
              ? `reply ${formatDistanceToNow(metrics.lastReply, { addSuffix: true })}`
              : null
          }
        />
      </div>
    </div>
  );
}

function Pill({
  icon, label, value, sub, valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string | null;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('text-sm font-semibold tabular-nums mt-0.5 truncate', valueClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] text-muted-foreground/80 truncate">{sub}</div>
      )}
    </div>
  );
}
