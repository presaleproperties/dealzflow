import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ListTodo, Calendar, StickyNote, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  const [plusOpen, setPlusOpen] = useState(false);
  const updateContact = useUpdateCrmContact();
  const initials = ((contact.first_name?.[0] ?? '') + (contact.last_name?.[0] ?? '')).toUpperCase() || '?';

  // Pad scroll panels to clear the floating bottom-nav (uses global token).
  const bottomPadStyle = { paddingBottom: 'var(--bottom-nav-pad)' } as const;

  return (
    <div className="-mx-3 -my-3 sm:-mx-4 sm:-my-4 flex flex-col crm-mobile-page" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Slim identity header (sticky) */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
          <Link to="/crm/leads" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary active:opacity-60 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> Leads
          </Link>
          {/* Prominent live lead score chip */}
          <div
            className="inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full border tabular-nums shadow-sm"
            style={{
              background: `${leadScore.color}14`,
              borderColor: `${leadScore.color}40`,
            }}
            aria-label={`Lead score ${leadScore.score} out of 100 — ${leadScore.label}`}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.04em]"
              style={{ background: leadScore.color, color: '#fff' }}
            >
              {leadScore.label?.[0] || '·'}
            </span>
            <span className="text-[18px] font-bold leading-none" style={{ color: leadScore.color }}>
              {leadScore.score}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
          {/* Inline stage swap — discreet */}
          <select
            value={contact.status || ''}
            onChange={(e) =>
              updateContact.mutate({
                id: contact.id,
                updates: { status: e.target.value, status_changed_at: new Date().toISOString() },
                oldValues: { status: contact.status },
              })
            }
            className="h-8 max-w-[96px] px-1.5 rounded-md bg-muted/40 border border-border text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            aria-label="Stage"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* Inline Quick add — saves a row */}
          <button
            onClick={() => setPlusOpen(true)}
            aria-label="Quick add"
            className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-sm"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.6} />
          </button>
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

      {/* + action sheet — premium quick-add */}
      <Sheet open={plusOpen} onOpenChange={setPlusOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-border/60 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] [&>button]:hidden"
        >
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden />

          <SheetHeader className="text-left space-y-1 pb-4">
            <SheetTitle className="text-[20px] font-bold tracking-tight">Quick add</SheetTitle>
            <p className="text-[13px] text-muted-foreground">
              Log activity for {contact.first_name || 'this lead'}
            </p>
          </SheetHeader>

          <div className="space-y-2">
            <QuickAction
              icon={StickyNote}
              title="Note"
              description="Capture a thought or call summary"
              tint="amber"
              onClick={() => {
                setPlusOpen(false);
                setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-quick-note-input]')?.focus(), 220);
              }}
            />
            <QuickAction
              icon={ListTodo}
              title="Task"
              description="Schedule a follow-up to do"
              tint="blue"
              onClick={() => { setPlusOpen(false); onTask(); }}
            />
            <QuickAction
              icon={Calendar}
              title="Showing"
              description="Book a property tour"
              tint="green"
              onClick={() => { setPlusOpen(false); onShowing(); }}
            />
          </div>

          <button
            onClick={() => setPlusOpen(false)}
            className="mt-5 w-full h-11 rounded-2xl bg-muted/60 text-[14px] font-semibold text-foreground active:scale-[0.98] transition-transform"
          >
            Cancel
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const TINT_STYLES: Record<string, { bg: string; fg: string; ring: string }> = {
  amber: { bg: 'bg-amber-500/12', fg: 'text-amber-500', ring: 'ring-amber-500/20' },
  blue:  { bg: 'bg-sky-500/12',   fg: 'text-sky-500',   ring: 'ring-sky-500/20' },
  green: { bg: 'bg-emerald-500/12', fg: 'text-emerald-500', ring: 'ring-emerald-500/20' },
};

function QuickAction({
  icon: Icon, title, description, onClick, tint = 'amber', disabled,
}: {
  icon: any; title: string; description: string; onClick: () => void;
  tint?: 'amber' | 'blue' | 'green'; disabled?: boolean;
}) {
  const t = TINT_STYLES[tint];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group w-full flex items-center gap-3.5 rounded-2xl border border-border/60 bg-card p-3.5 text-left active:scale-[0.99] active:bg-muted/40 disabled:opacity-40 transition-all"
    >
      <span className={`shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ring-1 ${t.bg} ${t.ring}`}>
        <Icon className={`w-5 h-5 ${t.fg}`} strokeWidth={2.2} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-foreground leading-tight">{title}</span>
        <span className="block text-[12.5px] text-muted-foreground leading-snug mt-0.5">{description}</span>
      </span>
      <span className="shrink-0 text-muted-foreground/50 text-[18px] leading-none pr-1">›</span>
    </button>
  );
}
