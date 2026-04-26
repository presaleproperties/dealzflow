import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Mail, ListTodo, Calendar, StickyNote, Plus, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatContactName } from '@/lib/format';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { LeadStatusBadge } from './LeadStatusBadge';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { LEAD_STATUSES } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';

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

  // Only the global BottomNav sits at the bottom now — pad once.
  const bottomPadClass = 'pb-[calc(72px+env(safe-area-inset-bottom,0px))]';

  return (
    <div className="-mx-3 -my-3 sm:-mx-4 sm:-my-4 flex flex-col" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Slim identity header (sticky) */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
        <div className="px-3 pt-2 pb-1 flex items-center justify-between">
          <Link to="/crm/leads" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary active:opacity-60 transition-opacity">
            <ArrowLeft className="w-4 h-4" /> Leads
          </Link>
          <span className="text-[11px] text-muted-foreground tabular-nums font-semibold">
            Score <span className="text-foreground">{leadScore.score}</span>
          </span>
        </div>
        <div className="px-3 pb-2 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 border"
            style={{ background: `${leadScore.color}15`, borderColor: `${leadScore.color}40`, color: leadScore.color }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-semibold text-foreground leading-tight truncate">
              {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
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
            className="h-8 max-w-[110px] px-2 rounded-md bg-muted/40 border border-border text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            aria-label="Stage"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 px-3 gap-0 flex-shrink-0 sticky top-[88px] z-20 bg-background">
          {(['activity','details','insights'] as const).map(v => (
            <TabsTrigger
              key={v}
              value={v}
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[12px] py-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground"
            >
              {v}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="activity" className={`flex-1 min-h-0 mt-0 px-2 pt-3 ${bottomPadClass} overflow-y-auto overscroll-contain`}>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {activitySlot}
          </div>
        </TabsContent>
        <TabsContent value="details" className={`flex-1 min-h-0 mt-0 px-3 pt-3 ${bottomPadClass} overflow-y-auto overscroll-contain space-y-3`}>
          {detailsSlot}
        </TabsContent>
        <TabsContent value="insights" className={`flex-1 min-h-0 mt-0 px-3 pt-3 ${bottomPadClass} overflow-y-auto overscroll-contain space-y-3`}>
          {insightsSlot}
        </TabsContent>
      </Tabs>

      {/* Lofty-style sticky action bar — sits ABOVE the global BottomNav */}
      <div
        className="fixed left-0 right-0 z-30 px-3 pointer-events-none"
        style={{ bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="pointer-events-auto mx-auto max-w-md flex items-center justify-between gap-2 px-2 py-2 rounded-full bg-background/95 backdrop-blur border border-border shadow-lg">
          <ActionChip icon={Phone} label="Call" tone="emerald" disabled={!contact.phone} onClick={onCall} />
          <ActionChip icon={Mail} label="Email" tone="blue" disabled={!contact.email} onClick={onEmail} />
          <ActionChip icon={MessageSquare} label="Text" tone="sky" disabled={!contact.phone} onClick={onText} />
          {/* Gold + */}
          <button
            onClick={() => setPlusOpen(true)}
            aria-label="Add"
            className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-md"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            <Plus className="w-5 h-5" strokeWidth={2.6} />
          </button>
          {/* AI sparkle */}
          <button
            onClick={() => toast.info('AI assistant coming soon')}
            aria-label="AI assistant"
            className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center bg-muted/60 border border-border active:scale-95 transition-transform"
          >
            <Sparkles className="w-[18px] h-[18px] text-foreground" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* + action sheet */}
      <Sheet open={plusOpen} onOpenChange={setPlusOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle>Quick add</SheetTitle>
            <button onClick={() => setPlusOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted active:scale-95 transition-transform">
              <X className="w-4 h-4" />
            </button>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <SheetAction icon={StickyNote} label="Note" onClick={() => {
              setPlusOpen(false);
              setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-quick-note-input]')?.focus(), 200);
            }} />
            <SheetAction icon={ListTodo} label="Task" onClick={() => { setPlusOpen(false); onTask(); }} />
            <SheetAction icon={Calendar} label="Showing" onClick={() => { setPlusOpen(false); onShowing(); }} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const TONE: Record<string, { bg: string; fg: string; ring: string }> = {
  emerald: { bg: 'hsl(142 71% 45% / 0.10)', fg: 'hsl(142 71% 38%)', ring: 'hsl(142 71% 45% / 0.25)' },
  blue:    { bg: 'hsl(220 90% 56% / 0.10)', fg: 'hsl(220 90% 50%)', ring: 'hsl(220 90% 56% / 0.25)' },
  sky:     { bg: 'hsl(199 89% 48% / 0.10)', fg: 'hsl(199 89% 42%)', ring: 'hsl(199 89% 48% / 0.25)' },
};

function ActionChip({
  icon: Icon, label, onClick, disabled, tone,
}: { icon: any; label: string; onClick: () => void; disabled?: boolean; tone: 'emerald' | 'blue' | 'sky' }) {
  const t = TONE[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex-1 min-w-0 h-11 rounded-full flex items-center justify-center gap-1.5 active:scale-[0.96] disabled:opacity-40 transition-all border"
      style={{ background: t.bg, color: t.fg, borderColor: t.ring }}
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
      <span className="text-[12px] font-semibold">{label}</span>
    </button>
  );
}

function SheetAction({ icon: Icon, label, onClick, disabled }: { icon: any; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl bg-muted/40 border border-border active:bg-muted disabled:opacity-40 transition-colors"
    >
      <Icon className="w-5 h-5 text-foreground" strokeWidth={2} />
      <span className="text-[12px] font-semibold text-foreground">{label}</span>
    </button>
  );
}
