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

export function CampaignsTab() {
  const { data: campaigns = [], isLoading } = useCrmCampaigns();
  const isMobile = useIsMobile();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CrmEmailCampaign | null>(null);

  if (isLoading) return <div className="space-y-2 pt-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
        <Button size="sm" className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white min-h-[44px] sm:min-h-0" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No campaigns yet.</p>
      ) : isMobile ? (
        /* Mobile: Card view */
        <div className="space-y-2">
          {campaigns.map(c => {
            const st = STATUS_STYLES[c.status ?? 'draft'] ?? STATUS_STYLES.draft;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="w-full text-left bg-card rounded-[10px] border border-border p-3 shadow-sm active:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.subject}</p>
                  <Badge variant="outline" className="border-0 text-[10px] font-semibold capitalize shrink-0" style={{ background: st.bg, color: st.text }}>
                    {c.status ?? 'draft'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[12px] text-muted-foreground">
                  <span>{c.recipients_count ?? 0} recipients</span>
                  <span>{c.sent_at ? format(new Date(c.sent_at), 'MMM d') : 'Not sent'}</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.opens ?? 0} opens</Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.clicks ?? 0} clicks</Badge>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Desktop/Tablet: Table view */
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Recipients</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Sent</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Opens</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Clicks</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const st = STATUS_STYLES[c.status ?? 'draft'] ?? STATUS_STYLES.draft;
                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelected(c)}>
                    <td className="px-4 py-3 font-medium text-foreground">{c.subject}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.recipients_count ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.sent_at ? format(new Date(c.sent_at), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.opens ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.clicks ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-0 text-[11px] font-semibold capitalize" style={{ background: st.bg, color: st.text }}>
                        {c.status ?? 'draft'}
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
