// Tier 2 — /crm/campaigns/:id
// Recipient list for a single campaign. Per-recipient delivery/open/click/reply.
// Clicking a recipient opens their inbox thread (or shows a "send-only" state
// if no thread exists or no reply yet).

import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Megaphone, Mail, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/crm/shared/Pill';
import { toast } from 'sonner';

interface Recipient {
  id: string;
  contact_id: string;
  subject: string;
  sent_at: string;
  status: string;
  open_count: number;
  click_count: number;
  opened_at: string | null;
  clicked_at: string | null;
  thread_id: string | null;
  contact?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export default function CrmCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ['crm-campaign', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_email_campaigns')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: recipients, isLoading: recipientsLoading } = useQuery({
    queryKey: ['crm-campaign-recipients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from('crm_email_log')
        .select('id, contact_id, subject, sent_at, status, open_count, click_count, opened_at, clicked_at, thread_id')
        .eq('campaign_id', id!)
        .eq('direction', 'outbound')
        .order('sent_at', { ascending: false });
      if (error) throw error;

      const contactIds = Array.from(new Set((logs ?? []).map((r: any) => r.contact_id).filter(Boolean)));
      let contactsById = new Map<string, any>();
      if (contactIds.length > 0) {
        const { data: cs } = await supabase
          .from('crm_contacts')
          .select('id, first_name, last_name, email')
          .in('id', contactIds);
        contactsById = new Map(((cs ?? []) as any[]).map((c) => [c.id, c]));
      }

      // Replies: inbound messages in any of these threads
      const threadIds = Array.from(new Set((logs ?? []).map((r: any) => r.thread_id).filter(Boolean)));
      let repliedThreads = new Set<string>();
      if (threadIds.length > 0) {
        const { data: inbound } = await supabase
          .from('crm_email_log')
          .select('thread_id')
          .in('thread_id', threadIds)
          .eq('direction', 'inbound');
        repliedThreads = new Set(((inbound ?? []) as any[]).map((r) => r.thread_id));
      }

      return ((logs ?? []) as any[]).map((r) => ({
        ...r,
        contact: r.contact_id ? contactsById.get(r.contact_id) ?? null : null,
        replied: !!(r.thread_id && repliedThreads.has(r.thread_id)),
      })) as (Recipient & { replied: boolean })[];
    },
  });

  const summary = useMemo(() => {
    const list = recipients ?? [];
    const total = list.length;
    const delivered = list.filter((r) => r.status === 'sent' || r.status === 'delivered').length;
    const opened = list.filter((r) => r.open_count > 0).length;
    const clicked = list.filter((r) => r.click_count > 0).length;
    const replied = list.filter((r: any) => r.replied).length;
    return { total, delivered, opened, clicked, replied };
  }, [recipients]);

  const openRecipient = (r: Recipient & { replied: boolean }) => {
    if (r.thread_id && r.replied) {
      navigate(`/crm/inbox?channel=email&thread=${r.thread_id}`);
      return;
    }
    if (r.contact_id) {
      // Send-only: no reply yet. Take user to the lead detail so they can see context.
      toast.info('No inbox thread yet — campaign send only. Opening lead profile.');
      navigate(`/crm/leads/${r.contact_id}`);
      return;
    }
    toast.info('No inbox thread — campaign send only.');
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6 gap-4">
      <header className="flex items-start gap-3 flex-wrap">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/crm/campaigns"><ArrowLeft className="h-4 w-4 mr-1.5" />All campaigns</Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold flex items-center gap-2 truncate">
            <Megaphone className="h-5 w-5 shrink-0" />
            {campaignLoading ? <Skeleton className="h-5 w-64" /> : (campaign?.subject ?? '(no subject)')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {campaign?.sent_at
              ? `Sent ${format(new Date(campaign.sent_at), 'MMM d, yyyy h:mm a')}`
              : campaign?.scheduled_for
                ? `Scheduled for ${format(new Date(campaign.scheduled_for), 'MMM d, yyyy h:mm a')}`
                : 'Draft'}
            {' · '}
            <Pill tone="info" size="sm">{campaign?.status ?? 'draft'}</Pill>
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard label="Recipients" value={summary.total} />
        <StatCard label="Delivered" value={summary.delivered} total={summary.total} />
        <StatCard label="Opened" value={summary.opened} total={summary.total} />
        <StatCard label="Clicked" value={summary.clicked} total={summary.total} />
        <StatCard label="Replied" value={summary.replied} total={summary.total} />
      </section>

      <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Opens</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Replied</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipientsLoading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!recipientsLoading && (recipients ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                  No recipients logged for this campaign yet.
                </TableCell>
              </TableRow>
            )}
            {!recipientsLoading && (recipients ?? []).map((r: any) => {
              const name = [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(' ').trim() || '—';
              const deliveryTone =
                r.status === 'sent' || r.status === 'delivered' ? 'success'
                : r.status === 'failed' || r.status === 'bounced' ? 'danger'
                : 'neutral';
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openRecipient(r)}
                >
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">
                    {r.contact?.email ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.sent_at ? format(new Date(r.sent_at), 'MMM d, h:mm a') : '—'}
                  </TableCell>
                  <TableCell>
                    <Pill tone={deliveryTone as any} size="sm">{r.status}</Pill>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.open_count > 0 ? <Pill tone="success" size="sm">{r.open_count}</Pill> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.click_count > 0 ? <Pill tone="success" size="sm">{r.click_count}</Pill> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    {r.replied ? <Pill tone="success" size="sm">replied</Pill> : <span className="text-muted-foreground text-xs">—</span>}
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

function StatCard({ label, value, total }: { label: string; value: number; total?: number }) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {pct !== null && <div className="text-xs text-muted-foreground">{pct}%</div>}
      </div>
    </div>
  );
}
