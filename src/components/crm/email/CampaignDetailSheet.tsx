import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { CrmEmailCampaign } from '@/hooks/useCrmEmail';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'hsl(220 10% 50% / 0.15)', text: 'hsl(220 10% 50%)' },
  scheduled: { bg: 'hsl(38 92% 50% / 0.15)', text: 'hsl(38 92% 50%)' },
  sent: { bg: 'hsl(142 71% 45% / 0.15)', text: 'hsl(142 71% 45%)' },
  cancelled: { bg: 'hsl(0 84% 60% / 0.15)', text: 'hsl(0 84% 60%)' },
};

interface Props {
  campaign: CrmEmailCampaign | null;
  onClose: () => void;
}

export function CampaignDetailSheet({ campaign, onClose }: Props) {
  if (!campaign) return null;
  const st = STATUS_STYLES[campaign.status ?? 'draft'] ?? STATUS_STYLES.draft;

  return (
    <Sheet open={!!campaign} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {campaign.subject}
            <Badge variant="outline" className="border-0 text-[11px] font-semibold capitalize" style={{ background: st.bg, color: st.text }}>
              {campaign.status}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{campaign.recipients_count ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Recipients</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{campaign.opens ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Opens</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{campaign.clicks ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Clicks</p>
            </div>
          </div>
          {campaign.sent_at && (
            <p className="text-xs text-muted-foreground">Sent on {format(new Date(campaign.sent_at), 'MMM d, yyyy h:mm a')}</p>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Body</p>
            <div className="bg-card border border-border rounded-lg p-4 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: campaign.body_html ?? '<p>No content</p>' }} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
