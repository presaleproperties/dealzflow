import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CrmContact } from '@/hooks/useCrmContacts';


interface MobileLeadDetailProps {
  contact: CrmContact;
  leadScore: { score: number; color: string; label: string };
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onTask: () => void;
  onShowing: () => void;
  activitySlot: React.ReactNode;
  detailsSlot: React.ReactNode;
  insightsSlot: React.ReactNode;
}

/**
 * Mobile-optimized Lead Detail layout — Lofty-inspired.
 * - Slim native-style identity header (no large CTA grid)
 * - Segmented tabs: Activity · Details · Insights
 * - Sticky bottom action pill: Call · Email · Message · + · AI
 *   (sits above the global BottomNav)
 */
export function MobileLeadDetail({
  contact,
  leadScore,
  onCall,
  onText,
  onEmail,
  onTask,
  onShowing,
  activitySlot,
  detailsSlot,
  insightsSlot,
}: MobileLeadDetailProps) {
  // Pad scroll panels to clear the floating bottom-nav (uses global token).

  const bottomPadStyle = { paddingBottom: 'var(--bottom-nav-pad)' } as const;

  // Score tier for tinted chip.
  const tier =
    leadScore.score >= 70 ? 'hot'
    : leadScore.score >= 40 ? 'warm'
    : leadScore.score > 0 ? 'cold'
    : 'none';

  return (
    <div className="flex flex-col crm-mobile-page" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Slim top bar — back + score only. Identity lives in the card below (matches desktop). */}
      <div
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-4 h-12 flex items-center justify-between">
          <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary active:opacity-60 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> Leads
          </Link>
          <div
            className="m-score tabular-nums"
            data-tier={tier}
            style={{ width: 'auto', height: '28px', padding: '0 10px', fontSize: '14px' }}
            aria-label={`Lead score ${leadScore.score} out of 100 — ${leadScore.label}`}
          >
            {leadScore.score}
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.06em] opacity-70">
              / 100
            </span>
          </div>
        </div>
      </div>

      {/* Tabs — Details first */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 px-4 gap-0 flex-shrink-0 sticky top-12 z-20 bg-background">
          {(['details','activity','insights'] as const).map(v => (
            <TabsTrigger
              key={v}
              value={v}
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[12px] py-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground"
            >
              {v}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" style={bottomPadStyle} className="flex-1 min-h-0 mt-0 px-3 pt-3 overflow-y-auto overscroll-contain space-y-3">
          {detailsSlot}
        </TabsContent>
        <TabsContent value="activity" style={bottomPadStyle} className="flex-1 min-h-0 mt-0 px-0 pt-0 overflow-y-auto overscroll-contain bg-background">
          <div className="w-full">
            {activitySlot}
          </div>
        </TabsContent>
        <TabsContent value="insights" style={bottomPadStyle} className="flex-1 min-h-0 mt-0 px-3 pt-3 overflow-y-auto overscroll-contain space-y-3">
          {insightsSlot}
        </TabsContent>
      </Tabs>

    </div>
  );
}

