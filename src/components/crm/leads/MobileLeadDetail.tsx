import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatContactName } from '@/lib/format';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { LeadStatusBadge } from './LeadStatusBadge';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { LEAD_STATUSES } from '@/hooks/useCrmContacts';


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
  const updateContact = useUpdateCrmContact();
  const initials = ((contact.first_name?.[0] ?? '') + (contact.last_name?.[0] ?? '')).toUpperCase() || '?';

  // Pad scroll panels to clear the floating bottom-nav (uses global token).
  const bottomPadStyle = { paddingBottom: 'var(--bottom-nav-pad)' } as const;

  // Score tier for tinted chip.
  const tier =
    leadScore.score >= 70 ? 'hot'
    : leadScore.score >= 40 ? 'warm'
    : leadScore.score > 0 ? 'cold'
    : 'none';

  return (
    <div className="-mx-3 -my-3 sm:-mx-4 sm:-my-4 flex flex-col crm-mobile-page" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Slim identity header (sticky) */}
      <div
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
          <Link to="/crm/leads" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary active:opacity-60 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> Leads
          </Link>
          {/* Compact tier-tinted score chip — no duplicate letter badge */}
          <div
            className="m-score tabular-nums"
            data-tier={tier}
            style={{ width: 'auto', height: '30px', padding: '0 12px', fontSize: '15px' }}
            aria-label={`Lead score ${leadScore.score} out of 100 — ${leadScore.label}`}
          >
            {leadScore.score}
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.06em] opacity-70">
              / 100
            </span>
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 border"
            style={{ background: `${leadScore.color}15`, borderColor: `${leadScore.color}40`, color: leadScore.color }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold text-foreground leading-tight tracking-[-0.015em] truncate">
              {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <LeadStatusBadge status={contact.status} />
            </div>
          </div>
          {/* Inline stage swap — discreet. The global "+" lives in BottomNav. */}
          <select
            value={contact.status || ''}
            onChange={(e) =>
              updateContact.mutate({
                id: contact.id,
                updates: { status: e.target.value, status_changed_at: new Date().toISOString() },
                oldValues: { status: contact.status },
              })
            }
            className="h-8 max-w-[120px] px-2 rounded-md bg-muted/40 border border-border text-[12px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            aria-label="Stage"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs — Details first */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 px-3 gap-0 flex-shrink-0 sticky top-[88px] z-20 bg-background">
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
        <TabsContent value="activity" style={bottomPadStyle} className="flex-1 min-h-0 mt-0 px-2 pt-3 overflow-y-auto overscroll-contain">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
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

