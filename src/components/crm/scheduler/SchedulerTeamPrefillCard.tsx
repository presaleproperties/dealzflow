import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Mail, Phone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  brokerage: string | null;
  headshot_url: string | null;
  headshot_focal_y: number | null;
  slug: string | null;
  role: string | null;
  presale_synced_at: string | null;
}

interface SyncResult {
  id: string;
  name: string;
  email: string;
  status: 'synced' | 'no_presale_match' | 'normalize_failed' | 'update_failed';
  applied?: string[];
  presale?: { phone?: string; title?: string; headshot?: boolean };
  error?: string;
}

const initialsOf = (name?: string | null, email?: string | null) =>
  ((name || email || '?')
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?');

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', agent: 'Agent', viewer: 'Viewer',
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never synced';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function MemberCard({ member, onResync, syncing }: {
  member: TeamMember; onResync?: () => void; syncing?: boolean;
}) {
  const focalY = member.headshot_focal_y ?? 30;
  const missing: string[] = [];
  if (!member.phone) missing.push('phone');
  if (!member.title) missing.push('title');
  if (!member.headshot_url) missing.push('headshot');

  return (
    <Card className="group relative overflow-hidden p-4 transition-shadow hover:shadow-md">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D7A542]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start gap-3.5">
        {member.headshot_url ? (
          <img
            src={member.headshot_url}
            alt={member.display_name || ''}
            className="w-14 h-14 rounded-full object-cover border border-border shrink-0"
            style={{ objectPosition: `center ${focalY}%` }}
          />
        ) : (
          <Avatar className="w-14 h-14 shrink-0 border border-border">
            <AvatarFallback
              className="text-sm font-medium text-white"
              style={{ background: '#D7A542', fontFamily: 'Georgia, serif' }}
            >
              {initialsOf(member.display_name, member.email)}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-semibold text-foreground leading-tight truncate">
              {member.display_name || 'Unnamed'}
            </h4>
            {member.role && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {ROLE_LABEL[member.role] || member.role}
              </span>
            )}
          </div>
          {member.title ? (
            <div className="text-[12px] text-foreground/70 truncate mt-0.5">{member.title}</div>
          ) : (
            <div className="text-[12px] italic text-muted-foreground/70 mt-0.5">No title</div>
          )}

          <div className="mt-2 space-y-1">
            {member.email && (
              <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{member.email}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Phone className="w-3 h-3 shrink-0" />
              {member.phone ? (
                <span>{member.phone}</span>
              ) : (
                <span className="italic text-muted-foreground/70">No phone in Presale</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-muted-foreground">
          {member.presale_synced_at ? `Synced ${relativeTime(member.presale_synced_at)}` : 'Not synced from Presale'}
        </span>
        {missing.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" />
            Missing {missing.join(', ')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Complete
          </span>
        )}
      </div>
    </Card>
  );
}

export function SchedulerTeamPrefillCard() {
  const { isOwnerOrAdmin } = useCrmAccess();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [lastResults, setLastResults] = useState<SyncResult[] | null>(null);

  const { data: team, isLoading } = useQuery({
    queryKey: ['scheduler-team-roster'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('id,display_name,email,phone,title,brokerage,headshot_url,headshot_focal_y,slug,role,presale_synced_at,is_active')
        .eq('is_active', true)
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
  });

  const stats = useMemo(() => {
    const list = team || [];
    const total = list.length;
    const withHeadshot = list.filter((m) => !!m.headshot_url).length;
    const withPhone = list.filter((m) => !!m.phone).length;
    const withTitle = list.filter((m) => !!m.title).length;
    const lastSync = list
      .map((m) => m.presale_synced_at ? new Date(m.presale_synced_at).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return { total, withHeadshot, withPhone, withTitle, lastSync: lastSync ? new Date(lastSync).toISOString() : null };
  }, [team]);

  const run = async () => {
    if (!isOwnerOrAdmin) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduler-prefill-team', { body: {} });
      if (error) throw error;
      const results: SyncResult[] = data?.results || [];
      setLastResults(results);
      const synced = results.filter((r) => r.status === 'synced').length;
      const missing = results.filter((r) => r.status === 'no_presale_match').length;
      toast.success(`Synced ${synced} of ${results.length} agents${missing ? ` · ${missing} not in Presale` : ''}`);
      await qc.invalidateQueries({ queryKey: ['scheduler-team-roster'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — minimal, no scroll required */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight">Team</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {stats.total} {stats.total === 1 ? 'member' : 'members'}
            {stats.lastSync && <> · Last Presale sync {relativeTime(stats.lastSync)}</>}
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Button size="sm" onClick={run} disabled={running} className="gap-1.5">
            {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing</>
                     : <><RefreshCw className="w-3.5 h-3.5" /> Sync from Presale</>}
          </Button>
        )}
      </div>

      {/* Coverage strip */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Headshots', value: stats.withHeadshot, total: stats.total },
            { label: 'Titles',    value: stats.withTitle,    total: stats.total },
            { label: 'Phones',    value: stats.withPhone,    total: stats.total },
          ].map((s) => {
            const pct = s.total ? Math.round((s.value / s.total) * 100) : 0;
            return (
              <Card key={s.label} className="px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{s.value}/{s.total}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[#D7A542] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Team grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-4 h-[140px] animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : (team || []).length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[13px] text-muted-foreground">No active team members yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(team || []).map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      )}

      {/* Last sync results — compact, collapsible-feeling */}
      {lastResults && lastResults.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
            <span className="inline-block w-1 h-1 rounded-full bg-[#D7A542]" />
            View last sync details ({lastResults.filter((r) => r.status === 'synced').length}/{lastResults.length} synced)
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l border-border">
            {lastResults.map((r) => (
              <div key={r.id} className="text-[11.5px] flex items-center gap-2">
                {r.status === 'synced' ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                <span className="text-foreground">{r.name}</span>
                {r.status === 'synced' && r.applied && r.applied.length > 0 && (
                  <span className="text-muted-foreground">— updated {r.applied.join(', ')}</span>
                )}
                {r.status === 'no_presale_match' && (
                  <span className="text-muted-foreground italic">— not in Presale</span>
                )}
                {r.error && <span className="text-destructive">{r.error}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
