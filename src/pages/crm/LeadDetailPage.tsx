import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCrmContact, useCrmContactMessages, useCrmContactShowings, useCrmContactTasks,
} from '@/hooks/useCrmLeadDetail';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useLeadNotes } from '@/hooks/useCrmNotes';
import { BookShowingDialog } from '@/components/crm/leads/BookShowingDialog';
import { CreateTaskDialog } from '@/components/crm/leads/CreateTaskDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { MobileLeadDetail } from '@/components/crm/leads/MobileLeadDetail';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { LeadTopBar } from '@/components/crm/leads/detail/LeadTopBar';
import { LeftSidebar } from '@/components/crm/leads/detail/LeftSidebar';
import { CenterColumn } from '@/components/crm/leads/detail/CenterColumn';
import { RightSidebar } from '@/components/crm/leads/detail/RightSidebar';
import type { CrmMessageRow, CrmShowing, CrmTask, LeadScore } from '@/components/crm/leads/detail/types';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: contact, isLoading } = useCrmContact(id);
  const { data: allContacts = [] } = useCrmContacts();
  const { data: messages = [] } = useCrmContactMessages(id);
  const { data: showings = [] } = useCrmContactShowings(id);
  const { data: tasks = [] } = useCrmContactTasks(id);
  const { data: notes = [] } = useLeadNotes(id);

  const [showEmail, setShowEmail] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showShowing, setShowShowing] = useState(false);

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

  const leadScore = useMemo<LeadScore>(() => {
    const inbound = (messages as CrmMessageRow[]).filter((m) => m.direction === 'inbound').length;
    const showingCount = showings.length;
    const completedTasks = (tasks as CrmTask[]).filter((t) => t.status === 'completed').length;
    const noteCount = notes.length;
    const score = Math.min(100, inbound * 10 + showingCount * 15 + completedTasks * 20 + noteCount * 5);
    const color = score >= 61 ? 'hsl(142 71% 45%)' : score >= 31 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';
    const label = score >= 61 ? 'Hot' : score >= 31 ? 'Warm' : 'Cold';
    return { score, color, label };
  }, [messages, showings, tasks, notes]);

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
    return (
      <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
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
    const onCall = () => c.phone && (window.location.href = `tel:${c.phone}`);
    return (
      <>
        <MobileLeadDetail
          contact={c}
          leadScore={leadScore}
          onCall={onCall}
          onText={() => setShowText(true)}
          onEmail={() => setShowEmail(true)}
          onTask={() => setShowTask(true)}
          onShowing={() => setShowShowing(true)}
          activitySlot={
            <CenterColumn
              contact={c}
              onCall={onCall}
              onText={() => setShowText(true)}
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
            />
          }
          insightsSlot={
            <RightSidebar
              contact={c}
              onAddTask={() => setShowTask(true)}
              onAddShowing={() => setShowShowing(true)}
              onCall={onCall}
              onText={() => setShowText(true)}
              onEmail={() => setShowEmail(true)}
              leadScore={leadScore}
              lastTouchHours={lastTouchHours}
            />
          }
        />

        <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
        <SendTextDialog contact={c} open={showText} onOpenChange={setShowText} />
        <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
        <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
      </>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      <LeadTopBar
        contact={c}
        navInfo={navInfo}
        onNavigate={handleNavigate}
        onTask={() => setShowTask(true)}
        onShowing={() => setShowShowing(true)}
      />

      <div className="flex flex-1 min-h-0">
        {!leftCollapsed && (
          <div className="w-[300px] xl:w-[360px] flex-shrink-0 border-r border-border bg-muted/30 overflow-y-auto p-5 transition-all">
            <LeftSidebar
              contact={c}
              leadScore={leadScore}
              lastTouchLabel={lastTouchLabel}
              daysInPipeline={daysInPipeline}
              onCall={() => c.phone && (window.location.href = `tel:${c.phone}`)}
              onSms={() => setShowText(true)}
              onEmail={() => setShowEmail(true)}
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
          <CenterColumn
            contact={c}
            onCall={() => c.phone && (window.location.href = `tel:${c.phone}`)}
            onText={() => setShowText(true)}
            onEmail={() => setShowEmail(true)}
            onTask={() => setShowTask(true)}
            onShowing={() => setShowShowing(true)}
          />
        </div>

        <PanelEdgeHandle
          side="right"
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed(v => !v)}
          label="Lead insights panel"
        />
        {!rightCollapsed && (
          <div className="w-[300px] xl:w-[360px] flex-shrink-0 border-l border-border bg-muted/30 overflow-y-auto p-5 transition-all">
            <RightSidebar
              contact={c}
              onAddTask={() => setShowTask(true)}
              onAddShowing={() => setShowShowing(true)}
              onCall={() => c.phone && (window.location.href = `tel:${c.phone}`)}
              onText={() => setShowText(true)}
              onEmail={() => setShowEmail(true)}
              leadScore={leadScore}
              lastTouchHours={lastTouchHours}
            />
          </div>
        )}
      </div>

      <ComposeEmailDialog contact={c} open={showEmail} onOpenChange={setShowEmail} />
      <SendTextDialog contact={c} open={showText} onOpenChange={setShowText} />
      <CreateTaskDialog contactId={c.id} assignedTo={c.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <BookShowingDialog contactId={c.id} project={c.project} open={showShowing} onOpenChange={setShowShowing} />
    </div>
  );
}
