import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Inbox, MessageSquare, AlertTriangle, ArrowRightLeft, Clock, Check, X, Sparkles } from 'lucide-react';
import { useZaraToday, useResolveNudge, useMarkHandoffRead, useZaraOutcomes, type ZaraTodayItem } from '@/hooks/useZaraToday';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/crm/shared/Pill';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function KindBadge({ kind, payload }: { kind: ZaraTodayItem['kind']; payload: any }) {
  if (kind === 'draft') return <Pill tone="gold" size="sm">{payload?.channel ?? 'reply'}</Pill>;
  if (kind === 'handoff') return <Pill tone="info" size="sm">handoff</Pill>;
  const k = payload?.nudge_kind ?? 'nudge';
  return <Pill tone={k === 'risk_scan' ? 'danger' : 'neutral'} size="sm">{String(k).replace('_',' ')}</Pill>;
}

function Icon({ kind, payload }: { kind: ZaraTodayItem['kind']; payload: any }) {
  if (kind === 'draft') return <MessageSquare className="h-4 w-4 text-primary" />;
  if (kind === 'handoff') return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
  if (payload?.nudge_kind === 'risk_scan') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Sparkles className="h-4 w-4 text-muted-foreground" />;
}

export default function ZaraTodayPage() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useZaraToday();
  const { data: outcomes = [] } = useZaraOutcomes(4);
  const resolve = useResolveNudge();
  const markRead = useMarkHandoffRead();

  const totals = outcomes.reduce(
    (acc, r) => ({
      sent: acc.sent + Number(r.sent || 0),
      replied: acc.replied + Number(r.replied || 0),
      booked: acc.booked + Number(r.booked || 0),
      edited: acc.edited + Number(r.edited || 0),
    }),
    { sent: 0, replied: 0, booked: 0, edited: 0 }
  );
  const replyRate = totals.sent ? Math.round((totals.replied / totals.sent) * 100) : 0;
  const bookRate = totals.sent ? Math.round((totals.booked / totals.sent) * 100) : 0;

  const onOpen = (it: ZaraTodayItem) => {
    if (it.kind === 'handoff') markRead.mutate(it.item_id);
    if (it.contact_id) navigate(`/crm/leads/${it.contact_id}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="zara-eyebrow">Zara · Executive desk</div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Today</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything Zara wants you to look at, in one list.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/crm/zara')}>
          Open cockpit
        </Button>
      </header>

      {/* Outcomes strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Drafts sent · 4w" value={totals.sent} />
        <Stat label="Reply rate" value={`${replyRate}%`} />
        <Stat label="Booked" value={totals.booked} />
        <Stat label="You edited" value={totals.edited} />
      </section>

      {/* Feed */}
      <section className="space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </>
        )}

        {!isLoading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
            <Inbox className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm font-medium">Inbox zero</div>
            <div className="text-xs text-muted-foreground mt-1">
              Zara has nothing waiting for you right now.
            </div>
          </div>
        )}

        {items.map((it) => (
          <article
            key={`${it.kind}:${it.item_id}`}
            className={cn(
              'group rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 transition',
              'p-3 sm:p-4 flex gap-3'
            )}
          >
            <div className="mt-1 shrink-0">
              <Icon kind={it.kind} payload={it.payload} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <KindBadge kind={it.kind} payload={it.payload} />
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}
                </span>
              </div>
              <button
                onClick={() => onOpen(it)}
                className="text-left w-full"
              >
                <div className="text-sm font-medium leading-snug truncate">{it.title}</div>
                {it.body && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{it.body}</div>
                )}
              </button>
            </div>

            <div className="flex flex-col gap-1 shrink-0">
              {it.kind === 'nudge' ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => resolve.mutate({ id: it.item_id, action: 'done' })}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Done
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => resolve.mutate({ id: it.item_id, action: 'snooze', hours: 4 })}
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" /> 4h
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => resolve.mutate({ id: it.item_id, action: 'dismiss' })}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpen(it)}>
                  Open
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
