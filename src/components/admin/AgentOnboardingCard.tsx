import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserCog, KeyRound, Link2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

type TeamRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  user_id: string | null;
  agent_onboarded_at: string | null;
};

export function AgentOnboardingCard() {
  const qc = useQueryClient();
  const [pwInputs, setPwInputs] = useState<Record<string, string>>({});
  const [shownPw, setShownPw] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: team = [], isLoading } = useQuery({
    queryKey: ['admin_crm_team'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('id, display_name, email, role, user_id, agent_onboarded_at')
        .eq('is_active', true)
        .order('role', { ascending: true })
        .order('display_name');
      if (error) throw error;
      return data as TeamRow[];
    },
  });

  const linkMut = useMutation({
    mutationFn: async (row: TeamRow) => {
      if (!row.email) throw new Error('Team member has no email on file');
      const { data, error } = await supabase.rpc('admin_link_crm_team_to_user', {
        _team_id: row.id,
        _email: row.email,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Agent linked to login & approved');
      qc.invalidateQueries({ queryKey: ['admin_crm_team'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to link agent'),
  });

  const pwMut = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.rpc('admin_set_user_password', {
        _target_user_id: userId,
        _new_password: password,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success('Password updated. Share it securely with the agent.'),
    onError: (e: any) => toast.error(e?.message ?? 'Failed to set password'),
  });

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
          Agent Onboarding
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Link CRM team members to their login and set a temporary password. They'll only see leads assigned to them.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {team.map((row) => {
          const linked = !!row.user_id;
          const onboarded = !!row.agent_onboarded_at;
          const isOwner = row.role === 'owner';
          return (
            <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-md border border-border bg-card/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {row.display_name ?? '(no name)'}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.role}</span>
                  {linked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-success">
                      <CheckCircle2 className="w-3 h-3" /> linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                      <AlertCircle className="w-3 h-3" /> not linked
                    </span>
                  )}
                  {linked && (
                    <span className="text-[10px] text-muted-foreground">
                      {onboarded ? '· onboarded' : '· pending wizard'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{row.email ?? '—'}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!linked && !isOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setBusyId(row.id); linkMut.mutate(row, { onSettled: () => setBusyId(null) }); }}
                    disabled={busyId === row.id || !row.email}
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />
                    Link & approve
                  </Button>
                )}
                {linked && !isOwner && (
                  <>
                    <Input
                      type="text"
                      placeholder="New password (8+)"
                      value={pwInputs[row.id] ?? ''}
                      onChange={(e) => setPwInputs((p) => ({ ...p, [row.id]: e.target.value }))}
                      className="h-8 w-44 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const pw = pwInputs[row.id];
                        if (!pw || pw.length < 8) {
                          toast.error('Password must be at least 8 characters');
                          return;
                        }
                        pwMut.mutate(
                          { userId: row.user_id!, password: pw },
                          { onSuccess: () => setPwInputs((p) => ({ ...p, [row.id]: '' })) },
                        );
                      }}
                      disabled={pwMut.isPending}
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                      Set password
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
