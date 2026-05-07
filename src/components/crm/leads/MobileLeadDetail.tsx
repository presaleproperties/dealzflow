import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Mail, CalendarPlus } from 'lucide-react';
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

  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const backTo = from || '/crm/leads';
  const backLabel = from === '/crm/pipeline' ? 'Pipeline' : 'Leads';

  // Score tier for tinted chip.
  const tier =
    leadScore.score >= 70 ? 'hot'
    : leadScore.score >= 40 ? 'warm'
    : leadScore.score > 0 ? 'cold'
    : 'none';

  return (
    <div className="flex flex-col crm-mobile-page flex-1 min-h-0">
      {/* Slim top bar — back + score only. Identity lives in the card below (matches desktop). */}
      <div
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0"
      >
        <div className="px-3 h-12 flex items-center justify-between">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary active:opacity-60 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
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

      {/* Compact action bar — 4 icon-circles, 44pt tap target. Replaces the
          oversized button grid that was eating ~80px of vertical real estate. */}
      <div className="flex items-center justify-around gap-2 px-4 py-2 border-b border-border/60 bg-background flex-shrink-0">
        {([
          { label: 'Call',    icon: Phone,         onClick: onCall,    enabled: !!contact.phone },
          { label: 'Text',    icon: MessageSquare, onClick: onText,    enabled: !!contact.phone },
          { label: 'Email',   icon: Mail,          onClick: onEmail,   enabled: !!contact.email },
          { label: 'Showing', icon: CalendarPlus,  onClick: onShowing, enabled: true },
        ] as const).map(({ label, icon: Icon, onClick, enabled }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={!enabled}
            className="flex flex-col items-center gap-1 px-2 py-1 rounded-lg active:bg-muted/60 disabled:opacity-40 disabled:active:bg-transparent transition-colors"
            aria-label={label}
          >
            <span className="w-11 h-11 rounded-full bg-muted/50 border border-border/60 flex items-center justify-center">
              <Icon className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
            </span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Tabs — Details first */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 flex-shrink-0 sticky top-12 z-20 bg-background">
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

