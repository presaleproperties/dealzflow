import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmCampaigns } from '@/hooks/useCrmEmail';
import { NewCampaignDialog } from './NewCampaignDialog';
import { CampaignDetailSheet } from './CampaignDetailSheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CrmEmailCampaign } from '@/hooks/useCrmEmail';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'hsl(220 10% 50% / 0.15)', text: 'hsl(220 10% 50%)' },
  scheduled: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 50%)' },
  sent: { bg: 'hsl(142 71% 45% / 0.15)', text: 'hsl(142 71% 45%)' },
  cancelled: { bg: 'hsl(0 84% 60% / 0.15)', text: 'hsl(0 84% 60%)' },
};

type MergedCampaign = {
  id: string;
  subject: string;
  status: string;
  recipients: number;
  opens: number;
  clicks: number;
  openRate: string;
  clickRate: string;
  sentAt: string | null;
  bodyHtml: string | null;
  source: 'local' | 'mailerlite';
};

export function CampaignsTab() {
  const { data: localCampaigns = [], isLoading: localLoading } = useCrmCampaigns();
  const isMobile = useIsMobile();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CrmEmailCampaign | null>(null);

  const isLoading = localLoading;

  const campaigns: MergedCampaign[] = [
    ...localCampaigns.map(c => ({
      id: c.id,
      subject: c.subject,
      status: c.status ?? 'draft',
      recipients: c.recipients_count ?? 0,
      opens: c.opens ?? 0,
      clicks: c.clicks ?? 0,
      openRate: (c.recipients_count ?? 0) > 0 ? `${(((c.opens ?? 0) / (c.recipients_count ?? 1)) * 100).toFixed(1)}%` : '0%',
      clickRate: (c.recipients_count ?? 0) > 0 ? `${(((c.clicks ?? 0) / (c.recipients_count ?? 1)) * 100).toFixed(1)}%` : '0%',
      sentAt: c.sent_at,
      bodyHtml: c.body_html,
      source: 'local' as const,
    })),
  ].sort((a, b) => {
    if (!a.sentAt) return 1;
    if (!b.sentAt) return -1;
    return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
  });

  if (isLoading) return <div className="space-y-2 pt-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
        </div>
        <Button size="sm" className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white min-h-[44px] sm:min-h-0" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No campaigns yet.</p>
      ) : isMobile ? (
        <div className="space-y-2">
          {campaigns.map(c => {
            const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.draft;
            return (
              <div key={c.id} className="w-full text-left bg-card rounded-[10px] border border-border p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.subject}</p>
                  <Badge variant="outline" className="border-0 text-[10px] font-semibold capitalize shrink-0" style={{ background: st.bg, color: st.text }}>
                    {c.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[12px] text-muted-foreground">
                  <span>{c.recipients} recipients</span>
                  <span>{c.sentAt ? format(new Date(c.sentAt), 'MMM d') : 'Not sent'}</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.openRate} opens</Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.clickRate} clicks</Badge>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Recipients</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Sent</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Open Rate</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Click Rate</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.draft;
                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{c.subject}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.recipients}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.sentAt ? format(new Date(c.sentAt), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.openRate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.clickRate}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-0 text-[11px] font-semibold capitalize" style={{ background: st.bg, color: st.text }}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewCampaignDialog open={showNew} onOpenChange={setShowNew} />
      <CampaignDetailSheet campaign={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
