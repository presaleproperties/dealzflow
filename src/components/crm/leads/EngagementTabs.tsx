import { useState } from 'react';
import { format } from 'date-fns';
import { Mail, ArrowUpRight, ArrowDownLeft, Eye, MousePointerClick, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { LiveActivityTimeline } from '@/components/presale/LiveActivityTimeline';
import { PresaleLeadBehaviorTimeline } from '@/components/presale/PresaleLeadBehaviorTimeline';
import { PresaleActivityWidget } from '@/components/crm/leads/PresaleActivityWidget';
import { PresaleSignupSourceCard } from '@/components/crm/leads/PresaleSignupSourceCard';
import { EmailPreviewDialog, type EmailLogRow } from '@/components/crm/leads/EmailPreviewDialog';
import { cn } from '@/lib/utils';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
}

type TabKey = 'emails' | 'behavior' | 'source';

/**
 * Unified Engagement card — collapses 5 previously separate widgets
 * (Email Activity, Email Attribution, Live Engagement, Presale Activity,
 * Web Behavior, Signup Source) into one tabbed surface.
 *
 * The "Behavior" tab is owner-only — team members see Emails + Source.
 */
export function EngagementTabs({ contact }: Props) {
  const { role } = useCrmAccess();
  const isOwner = role === 'owner';

  const TABS: { key: TabKey; label: string }[] = isOwner
    ? [
        { key: 'emails',   label: 'Emails' },
        { key: 'behavior', label: 'Behavior' },
        { key: 'source',   label: 'Source' },
      ]
    : [
        { key: 'emails', label: 'Emails' },
        { key: 'source', label: 'Source' },
      ];

  const [tab, setTab] = useState<TabKey>('emails');
  const { data: emails = [], isLoading: emailsLoading } = useCrmEmailLog(contact.id);
  const [previewEmail, setPreviewEmail] = useState<EmailLogRow | null>(null);

  const emailRows = (emails as EmailLogRow[]) ?? [];
  const lastInbound = emailRows.find((e) => e.direction === 'inbound');

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Tab rail */}
      <div className="flex items-center border-b border-border/60 bg-muted/30">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors',
              tab === t.key
                ? 'text-foreground bg-card border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 min-h-[160px]">
        {tab === 'emails' && (
          <>
            {/* Inline last-inbound preview — Phase D */}
            {lastInbound && (
              <button
                type="button"
                onClick={() => setPreviewEmail(lastInbound)}
                className="w-full text-left p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold text-emerald-700 dark:text-emerald-500">
                  <ArrowDownLeft className="w-3 h-3" />
                  Last reply
                  <span className="ml-auto normal-case tracking-normal text-muted-foreground font-medium">
                    {lastInbound.sent_at ? format(new Date(lastInbound.sent_at), 'MMM d · h:mm a') : ''}
                  </span>
                </div>
                <p className="text-[12.5px] font-medium text-foreground truncate mt-1">
                  {lastInbound.subject || '(no subject)'}
                </p>
              </button>
            )}

            {emailsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            ) : emailRows.length === 0 ? (
              <Empty icon={Mail} message="No email activity" />
            ) : (
              <div className="space-y-1.5">
                {emailRows.slice(0, 8).map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => setPreviewEmail(email)}
                    className="w-full text-left flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-6 h-6 rounded border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                      {email.direction === 'outbound'
                        ? <ArrowUpRight className="w-3 h-3 text-foreground/70" />
                        : <ArrowDownLeft className="w-3 h-3 text-foreground/70" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-foreground truncate">{email.subject || '(no subject)'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-[10.5px] text-muted-foreground tabular-nums">
                          {email.sent_at ? format(new Date(email.sent_at), 'MMM d · h:mm a') : ''}
                        </p>
                        {email.direction === 'outbound' && (email.open_count ?? 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-0 rounded font-semibold bg-emerald-500/10 text-emerald-600 inline-flex items-center gap-0.5 tabular-nums">
                            <Eye className="w-2.5 h-2.5" />
                            {email.open_count}
                          </span>
                        )}
                        {email.direction === 'outbound' && (email.click_count ?? 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-0 rounded font-semibold bg-blue-500/10 text-blue-600 inline-flex items-center gap-0.5 tabular-nums">
                            <MousePointerClick className="w-2.5 h-2.5" />
                            {email.click_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'behavior' && isOwner && (
          <div className="space-y-3">
            {contact.id && <LiveActivityTimeline contactId={contact.id} limit={10} />}
            <div className="pt-2 border-t border-border/40">
              <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/80 mb-1.5">
                Presale activity
              </p>
              <PresaleLeadBehaviorTimeline
                lead={{ email: contact?.email, phone: contact?.phone, name: contact?.first_name }}
                compact
              />
            </div>
            <div className="pt-2 border-t border-border/40">
              <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/80 mb-1.5">
                Web behavior
              </p>
              <PresaleActivityWidget contactId={contact?.id} />
            </div>
          </div>
        )}

        {tab === 'source' && (
          <PresaleSignupSourceCard contact={contact} />
        )}
      </div>

      <EmailPreviewDialog
        email={previewEmail}
        open={!!previewEmail}
        onOpenChange={(o) => !o && setPreviewEmail(null)}
        contactEmail={contact.email}
      />
    </div>
  );
}

function Empty({ icon: Icon, message }: { icon: typeof Mail; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
      <Icon className="w-5 h-5 opacity-50 mb-1" />
      <p className="text-[11.5px]">{message}</p>
    </div>
  );
}
