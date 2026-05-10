import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCrmContact, useCrmContactMessages, useCrmContactShowings, useCrmContactTasks,
} from '@/hooks/useCrmLeadDetail';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useLeadNotes } from '@/hooks/useCrmNotes';
import { BookShowingDialog } from '@/components/crm/leads/BookShowingDialog';
import { CreateTaskDialog } from '@/components/crm/leads/CreateTaskDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { LeadEmailThreadDialog } from '@/components/crm/leads/LeadEmailThreadDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { SendProjectDialog } from '@/components/crm/leads/SendProjectDialog';
import { MobileLeadDetail } from '@/components/crm/leads/MobileLeadDetail';
import { useIsCompact as useIsMobile } from '@/hooks/use-mobile';
import { useOpenWhatsAppChat } from '@/hooks/useOpenWhatsAppChat';
import { useOpenChat } from '@/hooks/useOpenChat';
import type { MessagingChannel } from '@/hooks/useSms';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { LeadTopBar } from '@/components/crm/leads/detail/LeadTopBar';
import { LeftSidebar } from '@/components/crm/leads/detail/LeftSidebar';
import { CenterColumn } from '@/components/crm/leads/detail/CenterColumn';
import { RightSidebar } from '@/components/crm/leads/detail/RightSidebar';
import { useDialer } from '@/hooks/useDialer';
import { formatContactName } from '@/lib/format';
import { PanelEdgeHandle } from '@/components/crm/leads/detail/PanelEdgeHandle';

import type { LeadScore } from '@/components/crm/leads/detail/types';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: contact, isLoading } = useCrmContact(id);
  const dialer = useDialer();
  const callContact = (c: CrmContact | undefined | null) => {
    if (!c?.phone) return;
    dialer.startCall({
      contact: { id: c.id, name: formatContactName(c), phone: c.phone },
      number: c.phone,
    });
  };
  // Only fetch the full contacts list on desktop (used for prev/next nav).
  // On mobile this query was loading ~7,500 rows on every detail open and freezing the app.
  const { data: allContacts = [] } = useCrmContacts(undefined, { enabled: !isMobile });
  const { data: messages = [] } = useCrmContactMessages(id);
  const { data: showings = [] } = useCrmContactShowings(id);
  const { data: tasks = [] } = useCrmContactTasks(id);
  const { data: notes = [] } = useLeadNotes(id);

  const [showEmail, setShowEmail] = useState(false);
  const [showText, setShowText] = useState(false);
  const [textChannel, setTextChannel] = useState<MessagingChannel>('sms');
  const openWhatsAppChat = useOpenWhatsAppChat();
  const openChat = useOpenChat();
  const [showTask, setShowTask] = useState(false);
  const [showShowing, setShowShowing] = useState(false);
  const [showSendProject, setShowSendProject] = useState(false);
  const [showEmailThread, setShowEmailThread] = useState(false);

  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.leadDetail.leftCollapsed') === '1';
  });
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.leadDetail.rightCollapsed') === '1';
  });
  useEffect(() => {
    localStorage.setItem('crm.leadDetail.leftCollapsed', leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem('crm.leadDetail.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  // Source of truth: server-computed `lead_score` (recalc_lead_score in DB).
  // Tiers must match LeadsTable / Kanban / Mobile list (70 = hot, 40 = warm).
  const queryClient = useQueryClient();
  const leadScore = useMemo<LeadScore>(() => {
    const raw = (contact as unknown as Record<string, unknown> | undefined)?.lead_score;
    const score = typeof raw === 'number' ? raw : 0;
    const color = score >= 70 ? 'hsl(142 71% 45%)' : score >= 40 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';
    const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : score > 0 ? 'Cold' : 'New';
    return { score, color, label };
  }, [contact]);

  // Recompute this lead's score whenever its detail page opens, then refresh
  // every cache that displays a score so the list, Kanban, and detail agree.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> })
        .rpc('recalc_lead_score', { _contact_id: id });
      if (cancelled || error) return;
      queryClient.invalidateQueries({ queryKey: ['crm-contact', id] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts-lite'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts-paginated'] });
    })();
    return () => { cancelled = true; };
  }, [id, queryClient, messages.length, showings.length, tasks.length, notes.length]);

  const lastTouchLabel = useMemo(() => {
    if (!contact) return 'N/A';
    const lt = (contact as unknown as Record<string, unknown>).last_touch_at as string | undefined;
    if (!lt) return 'None';
    const diff = Date.now() - new Date(lt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Now';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }, [contact]);

  const lastTouchHours = useMemo<number | null>(() => {
    if (!contact) return null;
    const lt = (contact as unknown as Record<string, unknown>).last_touch_at as string | undefined;
    if (!lt) return null;
    return Math.floor((Date.now() - new Date(lt).getTime()) / 3600000);
  }, [contact]);

  const daysInPipeline = useMemo(() => {
    if (!contact) return 0;
    return Math.floor((Date.now() - new Date(contact.created_at).getTime()) / 86400000);
  }, [contact]);

  const navInfo = useMemo(() => {
    if (!id || allContacts.length === 0) return null;
    const idx = allContacts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    return { index: idx, total: allContacts.length };
  }, [id, allContacts]);

  const handleNavigate = (dir: 'prev' | 'next') => {
    if (!navInfo) return;
    const newIdx = dir === 'prev' ? navInfo.index - 1 : navInfo.index + 1;
    if (newIdx < 0 || newIdx >= navInfo.total) return;
    navigate(`/crm/leads/${allContacts[newIdx].id}`);
  };

  if (isLoading) {
    if (isMobile) {
      // Mobile-tuned skeleton matching MobileLeadDetail rhythm.
      return (
        <div className="flex flex-col gap-4 px-4 pt-3 pb-[var(--bottom-nav-pad,7rem)]">
          {/* Top bar (back chevron + name) */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>
          {/* Action row */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
          {/* Pipeline + score card */}
          <Skeleton className="h-20 w-full rounded-xl" />
          {/* Tabs */}
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          {/* Activity items */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100dvh - 60px)' }}>
        <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0 flex items-center gap-4">
          <Skeleton className="h-4 w-16" />
          <div className="h-5 w-px bg-border" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[360px] flex-shrink-0 border-r border-border bg-muted/30 p-5 space-y-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-3 gap-1.5">
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0 p-6 space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
          <div className="w-[360px] flex-shrink-0 border-l border-border bg-muted/30 p-5 space-y-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-4 w-20 mt-4" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">Lead not found.</p>
        <Link to="/crm/leads" className="text-sm text-foreground hover:underline">← Back to Leads</Link>
      </div>
    );
  }

  const c = contact as CrmContact;

  // Mobile layout
  if (isMobile) {
    const onCall = () => callContact(c);
    const onSms = () => { setTextChannel('sms'); setShowText(true); };
    const onWhatsApp = () => {
      void openWhatsAppChat(c.id, () => { setTextChannel('whatsapp'); setShowText(true); });
    };
    return (
      <>
        <MobileLeadDetail
          contact={c}
          leadScore={leadScore}
          onCall={onCall}
          onText={onSms}
          onEmail={() => setShowEmail(true)}
          onTask={() => setShowTask(true)}
          onShowing={() => setShowShowing(true)}
          activitySlot={
            <CenterColumn
              contact={c}
              onCall={onCall}
              onText={onSms}
              onEmail={() => setShowEmail(true)}
              onTask={() => setShowTask(true)}
              onShowing={() => setShowShowing(true)}
            />
          }
          detailsSlot={
            <LeftSidebar
              contact={c}
              leadScore={leadScore}
              lastTouchLabel={lastTouchLabel}
              daysInPipeline={daysInPipeline}
              onCall={onCall}
              onSms={onSms}
              onEmail={() => setShowEmail(true)}
              onWhatsApp={onWhatsApp}
            />
          }
          insightsSlot={
            <RightSidebar
              contact={c}
              onAddTask={() => setShowTask(true)}
              onAddShowing={() => setShowShowing(true)}
              onCall={onCall}
              onText={onSms}
              onEmail={() => setShowEmail(true)}
              onSendProject={() => setShowSendProject(true)}
              leadScore={leadScore}
              lastTouchHours={lastTouchHours}
            />
          }
        />

        <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
        <SendTextDialog contact={c} open={showText} onOpenChange={setShowText} initialChannel={textChannel} />
        <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
        <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
        <SendProjectDialog contact={c} open={showSendProject} onOpenChange={setShowSendProject} />
      </>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100dvh - 60px)' }}>
      <LeadTopBar
        contact={c}
        navInfo={navInfo}
        onNavigate={handleNavigate}
        onTask={() => setShowTask(true)}
        onShowing={() => setShowShowing(true)}
        onSendProject={() => setShowSendProject(true)}
        onOpenEmailThread={() => setShowEmailThread(true)}
        showTaskCta={leftCollapsed}
        showShowingCta={rightCollapsed}
      />

      <div className="flex flex-1 min-h-0">
        {!leftCollapsed && (
          <div className="w-[300px] xl:w-[340px] flex-shrink-0 border-r border-border bg-muted/30 overflow-y-auto p-4 transition-all">
            <LeftSidebar
              contact={c}
              leadScore={leadScore}
              lastTouchLabel={lastTouchLabel}
              daysInPipeline={daysInPipeline}
              onCall={() => callContact(c)}
              onSms={() => { setTextChannel('sms'); setShowText(true); }}
              onEmail={() => setShowEmail(true)}
              onWhatsApp={() => {
                void openWhatsAppChat(c.id, () => { setTextChannel('whatsapp'); setShowText(true); });
              }}
            />
          </div>
        )}
        <PanelEdgeHandle
          side="left"
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed(v => !v)}
          label="Lead details panel"
        />

        <div className="flex-1 min-w-0 flex flex-col bg-background">
          <div className="flex-1 min-h-0 overflow-hidden">
            <CenterColumn
              contact={c}
              onCall={() => callContact(c)}
              onText={() => setShowText(true)}
              onEmail={() => setShowEmail(true)}
              onTask={() => setShowTask(true)}
              onShowing={() => setShowShowing(true)}
            />
          </div>
        </div>

        <PanelEdgeHandle
          side="right"
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed(v => !v)}
          label="Lead insights panel"
        />
        {!rightCollapsed && (
          <div className="w-[300px] xl:w-[340px] flex-shrink-0 border-l border-border bg-muted/30 overflow-y-auto p-4 transition-all">
            <RightSidebar
              contact={c}
              onAddTask={() => setShowTask(true)}
              onAddShowing={() => setShowShowing(true)}
              onCall={() => callContact(c)}
              onText={() => setShowText(true)}
              onEmail={() => setShowEmail(true)}
              onSendProject={() => setShowSendProject(true)}
              leadScore={leadScore}
              lastTouchHours={lastTouchHours}
            />
          </div>
        )}
      </div>

      <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
      <SendTextDialog contact={c} open={showText} onOpenChange={setShowText} initialChannel={textChannel} />
      <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
      <SendProjectDialog contact={c} open={showSendProject} onOpenChange={setShowSendProject} />
      <LeadEmailThreadDialog contact={c} open={showEmailThread} onOpenChange={setShowEmailThread} />
    </div>
  );
}
