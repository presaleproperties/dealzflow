// Tier 2 — /crm/campaigns
// List of all campaigns (draft, scheduled, sending, sent, paused).
// Aggregates from crm_email_campaigns + per-campaign rollups from crm_email_log.
// Clicking a row navigates to /crm/campaigns/:id (recipient detail).

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Megaphone, RefreshCw, ChevronRight, Mail, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/crm/shared/Pill';
import { cn } from '@/lib/utils';

interface CampaignRow {
  id: string;
  subject: string;
  status: string | null;
  recipients_count: number | null;
  opens: number | null;
  clicks: number | null;
  sent_at: string | null;
  scheduled_for: string | null;
  created_at: string;
}

interface Rollup {
  campaign_id: string;
  total: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
}

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'warning',
  sent: 'success',
  paused: 'warning',
  failed: 'danger',
};

function pct(n: number, d: number) {
  if (!d) return '—';
  const p = (n / d) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

export default function CrmCampaignsListPage() {
  const { data: campaigns, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['crm-campaigns-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_email_campaigns')
        .select('id, subject, status, recipients_count, opens, clicks, sent_at, scheduled_for, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const campaignIds = useMemo(() => (campaigns ?? []).map((c) => c.id), [campaigns]);

  const { data: rollups } = useQuery({
    queryKey: ['crm-campaigns-rollup', campaignIds],
    enabled: campaignIds.length > 0,
    queryFn: async () => {
      // Pull email_log rows for these campaigns and aggregate client-side.
      // For large volumes this would move server-side; for now 200 campaigns
      // * average recipient count is fine for a single fetch.
      const { data, error } = await supabase
        .from('crm_email_log')
        .select('campaign_id, status, open_count, click_count, thread_id')
        .in('campaign_id', campaignIds)
        .eq('direction', 'outbound');
      if (error) throw error;

      // Reply detection — find inbound messages on any thread referenced above.
      const threadIds = Array.from(
        new Set((data ?? []).map((r: any) => r.thread_id).filter(Boolean)),
      );
      let repliedThreads = new Set<string>();
      if (threadIds.length > 0) {
        const { data: inbound } = await supabase
          .from('crm_email_log')
          .select('thread_id')
          .in('thread_id', threadIds)
          .eq('direction', 'inbound');
        repliedThreads = new Set(((inbound ?? []) as any[]).map((r) => r.thread_id));
      }

      const map = new Map<string, Rollup>();
      for (const row of (data ?? []) as any[]) {
        const cid = row.campaign_id as string;
        if (!map.has(cid)) {
          map.set(cid, { campaign_id: cid, total: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 });
        }
        const r = map.get(cid)!;
        r.total += 1;
        if (row.status === 'sent' || row.status === 'delivered') r.delivered += 1;
        if ((row.open_count ?? 0) > 0) r.opened += 1;
        if ((row.click_count ?? 0) > 0) r.clicked += 1;
        if (row.thread_id && repliedThreads.has(row.thread_id)) r.replied += 1;
      }
      return map;
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6 gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Campaigns
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Past, scheduled, and draft campaigns. Replies promote threads back into the Inbox.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36%]">Name</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Opened</TableHead>
              <TableHead className="text-right">Clicked</TableHead>
              <TableHead className="text-right">Replied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 10 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && (campaigns ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-10">
                  No campaigns yet. Create one from the Email workspace.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (campaigns ?? []).map((c) => {
              const r = rollups?.get(c.id);
              const total = c.recipients_count ?? r?.total ?? 0;
              const sentLabel = c.sent_at
                ? formatDistanceToNow(new Date(c.sent_at), { addSuffix: true })
                : c.scheduled_for
                  ? `scheduled ${format(new Date(c.scheduled_for), 'MMM d, h:mm a')}`
                  : '—';
              const status = (c.status ?? 'draft').toLowerCase();
              const tone = STATUS_TONE[status] ?? 'neutral';
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link to={`/crm/campaigns/${c.id}`} className="block truncate">
                      {c.subject || '(no subject)'}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> email
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sentLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r ? pct(r.delivered, r.total) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r ? pct(r.opened, r.total) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r ? pct(r.clicked, r.total) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r ? pct(r.replied, r.total) : '—'}</TableCell>
                  <TableCell>
                    <Pill tone={tone} size="sm">{status}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
