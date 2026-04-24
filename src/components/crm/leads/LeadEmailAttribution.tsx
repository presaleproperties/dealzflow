import { Mail, Eye, MousePointerClick, Send, CheckCircle2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useCrmContactEmailSendLog,
  useCrmContactEmailEngagement,
} from '@/hooks/useCrmEmailAttribution';

interface Props {
  contactId: string;
}

export function LeadEmailAttribution({ contactId }: Props) {
  const { data: sends = [], isLoading: sendsLoading } = useCrmContactEmailSendLog(contactId);
  const { data: events = [], isLoading: evLoading } = useCrmContactEmailEngagement(contactId);

  const totalSent = sends.length;
  const totalOpens = sends.reduce((s, r: any) => s + (r.open_count ?? 0), 0);
  const totalClicks = sends.reduce((s, r: any) => s + (r.click_count ?? 0), 0);
  const openRate = totalSent ? Math.round((sends.filter((r: any) => (r.open_count ?? 0) > 0).length / totalSent) * 100) : 0;
  const ctr = totalSent ? Math.round((sends.filter((r: any) => (r.click_count ?? 0) > 0).length / totalSent) * 100) : 0;

  if (sendsLoading || evLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Mail className="w-4 h-4 text-primary shrink-0" />
        <h3 className="text-sm font-semibold truncate">Email attribution</h3>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        {totalSent} sent · {totalOpens} opens · {totalClicks} clicks
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Sent" value={String(totalSent)} icon={<Send className="w-3 h-3" />} />
        <Stat label="Opens" value={String(totalOpens)} icon={<Eye className="w-3 h-3" />} />
        <Stat label="Open rate" value={`${openRate}%`} icon={<CheckCircle2 className="w-3 h-3" />} />
        <Stat label="CTR" value={`${ctr}%`} icon={<MousePointerClick className="w-3 h-3" />} />
      </div>

      {sends.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3 text-center">No tracked emails yet</p>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {sends.map((s: any) => {
            const opened = (s.open_count ?? 0) > 0;
            const clicked = (s.click_count ?? 0) > 0;
            return (
              <div key={s.id} className="p-2.5 rounded-lg border border-border/50 bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate flex-1" title={s.subject}>
                    {s.subject || '(no subject)'}
                  </span>
                  <Badge variant={clicked ? 'default' : opened ? 'secondary' : 'outline'} className="text-[10px] py-0">
                    {clicked ? 'clicked' : opened ? 'opened' : s.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span>{format(new Date(s.sent_at), 'MMM d, h:mm a')}</span>
                  {opened && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {s.open_count}
                      {s.last_opened_at && <span className="opacity-70">· {formatDistanceToNow(new Date(s.last_opened_at), { addSuffix: true })}</span>}
                    </span>
                  )}
                  {clicked && (
                    <span className="flex items-center gap-1 text-primary">
                      <MousePointerClick className="w-3 h-3" /> {s.click_count}
                    </span>
                  )}
                </div>
                {s.clicked_url && (
                  <div className="text-[10px] text-primary truncate mt-0.5" title={s.clicked_url}>
                    → {s.clicked_url}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div className="pt-3 border-t border-border/50">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Recent engagement</div>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {events.slice(0, 12).map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                {e.event_type === 'email_click' ? (
                  <MousePointerClick className="w-3 h-3 text-primary shrink-0" />
                ) : (
                  <Eye className="w-3 h-3 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1">
                  {e.event_type === 'email_click' ? 'Clicked' : 'Opened'}
                  {e.campaign_name ? ` — ${e.campaign_name}` : ''}
                  {e.link_url ? ` · ${new URL(e.link_url).hostname}` : ''}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
