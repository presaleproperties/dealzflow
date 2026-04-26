import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, Mail, ListTodo, Calendar, MoreHorizontal, StickyNote } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
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
  /** Renders the activity timeline + quick action bar (CenterColumn). */
  activitySlot: React.ReactNode;
  /** Renders the LeftSidebar (identity, pipeline, tags, etc.). */
  detailsSlot: React.ReactNode;
  /** Renders the RightSidebar (Next Best Action, tasks, showings, score). */
  insightsSlot: React.ReactNode;
}

/**
 * Mobile-optimized Lead Detail layout.
 * - Sticky compact identity header w/ always-visible Call/Text/Email CTAs
 * - Segmented tabs: Activity · Details · Insights
 * - Bottom-fixed action bar (Note / Task / Showing / More) for one-thumb reach
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
  const [moreOpen, setMoreOpen] = useState(false);
  const updateContact = useUpdateCrmContact();
  const initials = ((contact.first_name?.[0] ?? '') + (contact.last_name?.[0] ?? '')).toUpperCase() || '?';

  return (
    <div className="-mx-3 -my-3 sm:-mx-4 sm:-my-4 flex flex-col" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Top: back link */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Leads
        </Link>
      </div>

      {/* Sticky identity + CTAs — always reachable */}
      <div className="sticky top-0 z-30 bg-background border-b border-border px-3 pb-2 pt-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0 border"
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
              <span className="text-[11px] text-muted-foreground tabular-nums">
                · {leadScore.label} {leadScore.score}
              </span>
            </div>
          </div>
        </div>

        {/* Always-visible 3-channel CTA row */}
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          <button
            onClick={onCall}
            disabled={!contact.phone}
            className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 active:bg-emerald-500/20 disabled:opacity-40 transition-colors"
            aria-label="Call"
          >
            <Phone className="w-4 h-4 text-emerald-600" strokeWidth={2.2} />
            <span className="text-[12px] font-semibold text-emerald-700">Call</span>
          </button>
          <button
            onClick={onText}
            disabled={!contact.phone}
            className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 active:bg-sky-500/20 disabled:opacity-40 transition-colors"
            aria-label="Text"
          >
            <MessageSquare className="w-4 h-4 text-sky-600" strokeWidth={2.2} />
            <span className="text-[12px] font-semibold text-sky-700">Text</span>
          </button>
          <button
            onClick={onEmail}
            disabled={!contact.email}
            className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-blue-700/10 border border-blue-700/30 active:bg-blue-700/20 disabled:opacity-40 transition-colors"
            aria-label="Email"
          >
            <Mail className="w-4 h-4 text-blue-700" strokeWidth={2.2} />
            <span className="text-[12px] font-semibold text-blue-800">Email</span>
          </button>
        </div>

        {/* Quick stage swap */}
        <div className="mt-2">
          <select
            value={contact.status || ''}
            onChange={(e) =>
              updateContact.mutate({
                id: contact.id,
                updates: { status: e.target.value, status_changed_at: new Date().toISOString() },
                oldValues: { status: contact.status },
              })
            }
            className="w-full h-9 px-2.5 rounded-lg bg-muted/40 border border-border text-[12px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
          >
            <option value="">No stage</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 px-3 gap-0 flex-shrink-0">
          <TabsTrigger
            value="activity"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[12px] py-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground"
          >
            Activity
          </TabsTrigger>
          <TabsTrigger
            value="details"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[12px] py-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground"
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            value="insights"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[12px] py-2.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground data-[state=active]:text-foreground"
          >
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="flex-1 min-h-0 mt-0 px-2 pt-3 pb-24 overflow-y-auto">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {activitySlot}
          </div>
        </TabsContent>
        <TabsContent value="details" className="flex-1 min-h-0 mt-0 px-3 pt-3 pb-24 overflow-y-auto space-y-3">
          {detailsSlot}
        </TabsContent>
        <TabsContent value="insights" className="flex-1 min-h-0 mt-0 px-3 pt-3 pb-24 overflow-y-auto space-y-3">
          {insightsSlot}
        </TabsContent>
      </Tabs>

      {/* Bottom-fixed action bar — log/note/task/showing always reachable */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border px-3 py-2"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
          <ActionTile icon={StickyNote} label="Note" onClick={() => { /* note inline lives in Activity */ document.querySelector<HTMLTextAreaElement>('[data-quick-note-input]')?.focus(); }} />
          <ActionTile icon={ListTodo} label="Task" onClick={onTask} />
          <ActionTile icon={Calendar} label="Showing" onClick={onShowing} />
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg bg-muted/40 border border-border active:bg-muted transition-colors">
                <MoreHorizontal className="w-4 h-4 text-foreground" strokeWidth={2} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Lead actions</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <SheetAction icon={Phone} label="Call" disabled={!contact.phone} onClick={() => { setMoreOpen(false); onCall(); }} />
                <SheetAction icon={MessageSquare} label="Text" disabled={!contact.phone} onClick={() => { setMoreOpen(false); onText(); }} />
                <SheetAction icon={Mail} label="Email" disabled={!contact.email} onClick={() => { setMoreOpen(false); onEmail(); }} />
                <SheetAction icon={ListTodo} label="Task" onClick={() => { setMoreOpen(false); onTask(); }} />
                <SheetAction icon={Calendar} label="Showing" onClick={() => { setMoreOpen(false); onShowing(); }} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

function ActionTile({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg bg-muted/40 border border-border active:bg-muted transition-colors"
    >
      <Icon className="w-4 h-4 text-foreground" strokeWidth={2} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
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
