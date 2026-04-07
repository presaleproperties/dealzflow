import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmCampaigns } from '@/hooks/useCrmEmail';
import { NewCampaignDialog } from './NewCampaignDialog';
import { CampaignDetailSheet } from './CampaignDetailSheet';
import type { CrmEmailCampaign } from '@/hooks/useCrmEmail';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'hsl(220 10% 50% / 0.15)', text: 'hsl(220 10% 50%)' },
  scheduled: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 50%)' },
  sent: { bg: 'hsl(142 71% 45% / 0.15)', text: 'hsl(142 71% 45%)' },
  cancelled: { bg: 'hsl(0 84% 60% / 0.15)', text: 'hsl(0 84% 60%)' },
};

export function CampaignsTab() {
  const { data: campaigns = [], isLoading } = useCrmCampaigns();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CrmEmailCampaign | null>(null);

  if (isLoading) return <div className="space-y-2 pt-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
        <Button size="sm" className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Subject</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Recipients</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Sent</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Opens</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Clicks</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No campaigns yet.</td></tr>
            ) : campaigns.map(c => {
              const st = STATUS_STYLES[c.status ?? 'draft'] ?? STATUS_STYLES.draft;
              return (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelected(c)}>
                  <td className="px-4 py-3 font-medium text-foreground">{c.subject}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.recipients_count ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.sent_at ? format(new Date(c.sent_at), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.opens ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.clicks ?? 0}</td>
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

      <NewCampaignDialog open={showNew} onOpenChange={setShowNew} />
      <CampaignDetailSheet campaign={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
