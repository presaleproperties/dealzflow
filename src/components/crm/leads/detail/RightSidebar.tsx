import { useState } from 'react';
import { format } from 'date-fns';
import {
  Calendar, ListTodo, Mail, ArrowUpRight, ArrowDownLeft, Eye, MousePointerClick,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContactTasks, useCrmContactShowings } from '@/hooks/useCrmLeadDetail';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { PresaleActivityWidget } from '@/components/crm/leads/PresaleActivityWidget';
import { PresaleLeadBehaviorTimeline } from '@/components/presale/PresaleLeadBehaviorTimeline';
import { LiveActivityTimeline } from '@/components/presale/LiveActivityTimeline';
import { PresaleSignupSourceCard } from '@/components/crm/leads/PresaleSignupSourceCard';
import { BehaviorIngestionStatus } from '@/components/crm/leads/BehaviorIngestionStatus';
import { LeadEmailAttribution } from '@/components/crm/leads/LeadEmailAttribution';
import { LeadConversationWidget } from '@/components/crm/leads/LeadConversationWidget';
import { LeadActivityDiagnostics } from '@/components/crm/leads/LeadActivityDiagnostics';
import { NextBestActionCard } from '@/components/crm/leads/NextBestActionCard';
import { EmailPreviewDialog, type EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { CrmTask, CrmShowing, LeadScore } from './types';
import { WidgetSection, EmptyWidget } from './shared';
import { TaskRow } from './TaskRow';

interface Props {
  contact: CrmContact;
  onAddTask: () => void;
  onAddShowing: () => void;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  leadScore: LeadScore;
  lastTouchHours: number | null;
}

export function RightSidebar({
  contact, onAddTask, onAddShowing, onCall, onText, onEmail, leadScore, lastTouchHours,
}: Props) {
  const { data: tasks = [] } = useCrmContactTasks(contact.id);
  const { data: showings = [] } = useCrmContactShowings(contact.id);
  const { data: emails, isLoading: emailsLoading } = useCrmEmailLog(contact.id);
  const [previewEmail, setPreviewEmail] = useState<EmailLogRow | null>(null);

  const now = new Date();
  const taskList = tasks as CrmTask[];
  const showingList = showings as CrmShowing[];
  const pendingTasks = taskList.filter((t) => t.status !== 'completed');
  const upcomingShowings = showingList
    .filter((s) => new Date(s.showing_date) >= now && s.status !== 'cancelled')
    .sort((a, b) => new Date(a.showing_date).getTime() - new Date(b.showing_date).getTime());

  const presaleUserId = (contact as unknown as Record<string, unknown>).presale_user_id as string | undefined;

  return (
    <div className="space-y-6">
      <NextBestActionCard
        contact={contact}
        leadScore={leadScore}
        lastTouchHours={lastTouchHours}
        pendingTaskCount={pendingTasks.length}
        upcomingShowingCount={upcomingShowings.length}
        onCall={onCall}
        onText={onText}
        onEmail={onEmail}
        onTask={onAddTask}
        onShowing={onAddShowing}
      />

      <WidgetSection title="Tasks" count={pendingTasks.length} onAdd={onAddTask} collapsible defaultOpen={pendingTasks.length > 0}>
        {pendingTasks.length === 0 ? (
          <EmptyWidget icon={ListTodo} message="No pending tasks" />
        ) : (
          <div className="space-y-1.5">
            {pendingTasks.map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </WidgetSection>

      <WidgetSection title="Appointments" count={upcomingShowings.length} onAdd={onAddShowing} collapsible defaultOpen={upcomingShowings.length > 0}>
        {upcomingShowings.length === 0 ? (
          <EmptyWidget icon={Calendar} message="No upcoming appointments" />
        ) : (
          <div className="space-y-2">
            {upcomingShowings.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-card border border-border/60 hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{s.project}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(s.showing_date), 'MMM d')} · {s.showing_time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetSection>

      <WidgetSection title="Email Activity">
        {emailsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : !emails || emails.length === 0 ? (
          <EmptyWidget icon={Mail} message="No email activity" />
        ) : (
          <div className="space-y-2">
            {(emails as EmailLogRow[]).slice(0, 5).map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => setPreviewEmail(email)}
                className="w-full text-left flex items-start gap-2.5 p-3 rounded-lg bg-card border border-border/60 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                  {email.direction === 'outbound'
                    ? <ArrowUpRight className="w-4 h-4 text-foreground/70" />
                    : <ArrowDownLeft className="w-4 h-4 text-foreground/70" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{email.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground">{email.sent_at ? format(new Date(email.sent_at), 'MMM d · h:mm a') : ''}</p>
                    {email.direction === 'outbound' && (email.open_count ?? 0) > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600 inline-flex items-center gap-1"
                        title={email.last_opened_at ? `Last opened ${format(new Date(email.last_opened_at), 'MMM d, h:mm a')}` : 'Opened'}
                      >
                        <Eye className="w-3 h-3" />
                        {email.open_count}
                      </span>
                    )}
                    {email.direction === 'outbound' && (email.click_count ?? 0) > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-600 inline-flex items-center gap-1"
                        title={email.last_clicked_at ? `Last clicked ${format(new Date(email.last_clicked_at), 'MMM d, h:mm a')}` : 'Clicked'}
                      >
                        <MousePointerClick className="w-3 h-3" />
                        {email.click_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </WidgetSection>

      <WidgetSection title="Email Conversation">
        <LeadConversationWidget contactId={contact?.id} />
      </WidgetSection>

      <WidgetSection title="Email Attribution">
        <LeadEmailAttribution contactId={contact?.id} />
      </WidgetSection>

      <WidgetSection title="Signup Source">
        <PresaleSignupSourceCard contact={contact} />
      </WidgetSection>

      <WidgetSection title="Behavior Ingestion">
        <BehaviorIngestionStatus contactId={contact?.id} />
      </WidgetSection>

      <WidgetSection title="Presale Activity (live)">
        <PresaleLeadBehaviorTimeline
          lead={{ email: contact?.email, phone: contact?.phone, name: contact?.first_name }}
          compact
        />
      </WidgetSection>

      <WidgetSection title="Web Behavior">
        <PresaleActivityWidget contactId={contact?.id} />
      </WidgetSection>

      <WidgetSection title="Activity Diagnostics">
        <LeadActivityDiagnostics
          contactId={contact?.id}
          contactEmail={contact?.email}
          presaleUserId={presaleUserId}
        />
      </WidgetSection>

      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => !o && setPreviewEmail(null)}
        contactEmail={contact.email}
      />
    </div>
  );
}
