import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Globe, FileText, Eye, MousePointerClick, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  contactId: string | undefined;
  contactEmail?: string | null;
  presaleUserId?: string | null;
}

interface DiagCounts {
  sessions: number;
  forms: number;
  views: number;
  engagement: number;
  sessionsByEmail: number;
  formsByEmail: number;
  viewsByEmail: number;
  engagementByEmail: number;
}

async function fetchCounts(contactId: string, email?: string | null): Promise<DiagCounts> {
  const headExact = (table: string, col: 'contact_id' | 'email', val: string) =>
    supabase
      .from(table as any)
      .select('id', { count: 'exact', head: true })
      .eq(col, val);

  const [s, f, v, e, sE, fE, vE, eE] = await Promise.all([
    headExact('crm_lead_behavior_sessions', 'contact_id', contactId),
    headExact('crm_lead_behavior_forms', 'contact_id', contactId),
    headExact('crm_lead_behavior_views', 'contact_id', contactId),
    headExact('crm_lead_behavior_engagement', 'contact_id', contactId),
    email ? headExact('crm_lead_behavior_sessions', 'email', email) : Promise.resolve({ count: 0 } as any),
    email ? headExact('crm_lead_behavior_forms', 'email', email) : Promise.resolve({ count: 0 } as any),
    email ? headExact('crm_lead_behavior_views', 'email', email) : Promise.resolve({ count: 0 } as any),
    email ? headExact('crm_lead_behavior_engagement', 'email', email) : Promise.resolve({ count: 0 } as any),
  ]);

  return {
    sessions: s.count ?? 0,
    forms: f.count ?? 0,
    views: v.count ?? 0,
    engagement: e.count ?? 0,
    sessionsByEmail: sE.count ?? 0,
    formsByEmail: fE.count ?? 0,
    viewsByEmail: vE.count ?? 0,
    engagementByEmail: eE.count ?? 0,
  };
}

export function LeadActivityDiagnostics({ contactId, contactEmail, presaleUserId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-activity-diagnostics', contactId, contactEmail],
    queryFn: () => fetchCounts(contactId!, contactEmail),
    enabled: !!contactId,
    staleTime: 30_000,
  });

  if (!contactId) return null;

  const rows = [
    { label: 'Web sessions', icon: Globe, key: 'sessions' as const, emailKey: 'sessionsByEmail' as const, tint: '180 60% 45%' },
    { label: 'Form submissions', icon: FileText, key: 'forms' as const, emailKey: 'formsByEmail' as const, tint: '270 70% 60%' },
    { label: 'Property views', icon: Eye, key: 'views' as const, emailKey: 'viewsByEmail' as const, tint: '210 85% 58%' },
    { label: 'Email engagement', icon: MousePointerClick, key: 'engagement' as const, emailKey: 'engagementByEmail' as const, tint: '142 70% 45%' },
  ];

  const totalLinked = data ? data.sessions + data.forms + data.views + data.engagement : 0;
  const totalByEmail = data
    ? data.sessionsByEmail + data.formsByEmail + data.viewsByEmail + data.engagementByEmail
    : 0;
  const orphanedRecords = totalByEmail - totalLinked;

  return (
    <div className="space-y-3 text-[13px]">
      {/* Identity row */}
      <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-muted-foreground/70" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Tracked email</span>
        </div>
        <div className="text-foreground/90 truncate" title={contactEmail || undefined}>
          {contactEmail || <span className="text-muted-foreground/60">— none on file —</span>}
        </div>
        {presaleUserId && (
          <div className="text-[11px] text-muted-foreground/70">
            Presale ID: <span className="font-mono">{presaleUserId.slice(0, 12)}…</span>
          </div>
        )}
      </div>

      {/* Counts grid */}
      <div className="space-y-1.5">
        {rows.map(({ label, icon: Icon, key, emailKey, tint }) => {
          const linked = data?.[key] ?? 0;
          const byEmail = data?.[emailKey] ?? 0;
          const orphaned = Math.max(byEmail - linked, 0);
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `hsl(${tint} / 0.12)`, color: `hsl(${tint})` }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-foreground/90 truncate">{label}</div>
                  {orphaned > 0 && (
                    <div className="text-[10.5px] uppercase tracking-wider text-amber-600 dark:text-amber-400/90">
                      {orphaned} not linked to lead
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn('font-mono tabular-nums text-[15px]', linked === 0 && 'text-muted-foreground/60')}>
                  {isLoading ? '—' : linked}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status / hints */}
      {!isLoading && data && (
        <div
          className={cn(
            'rounded-md border px-2.5 py-2 flex items-start gap-2',
            totalLinked === 0
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-emerald-500/30 bg-emerald-500/5'
          )}
        >
          {totalLinked === 0 ? (
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="text-[12px] leading-snug text-foreground/85">
            {totalLinked === 0 && totalByEmail === 0 && (
              <>No tracked web activity for this lead. URLs will appear once the Presale bridge captures sessions, form submissions, property views, or email opens/clicks.</>
            )}
            {totalLinked === 0 && totalByEmail > 0 && (
              <>
                <strong>{totalByEmail}</strong> activity record{totalByEmail === 1 ? '' : 's'} match this lead's email but aren't linked by <code>contact_id</code>. The Presale → CRM bridge needs to backfill the link.
              </>
            )}
            {totalLinked > 0 && orphanedRecords > 0 && (
              <>
                <strong>{totalLinked}</strong> linked + <strong>{orphanedRecords}</strong> matched only by email. Backfilling will surface them in the timeline.
              </>
            )}
            {totalLinked > 0 && orphanedRecords <= 0 && (
              <>All <strong>{totalLinked}</strong> tracked events are linked. URLs should render in the timeline.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
