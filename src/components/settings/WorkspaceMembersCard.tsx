import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Users, Send, Loader2, Search, Check, Copy, KeyRound, ShieldOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type WorkspaceCandidate = {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  workspace_status: string;
  crm_status: 'none' | 'active' | 'inactive';
  crm_role: 'owner' | 'admin' | 'agent' | 'viewer' | null;
  crm_team_id: string | null;
};

const ROLE_OPTIONS: Array<{ value: 'agent' | 'admin' | 'viewer'; label: string; hint: string }> = [
  { value: 'agent',  label: 'Agent',  hint: 'Sees & works only their assigned leads' },
  { value: 'admin',  label: 'Admin',  hint: 'Sees the whole team, can invite & manage' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only across the team' },
];

const STATUS_TONE: Record<WorkspaceCandidate['crm_status'], string> = {
  none:     'text-muted-foreground',
  active:   'text-emerald-500',
  inactive: 'text-amber-500',
};

const STATUS_LABEL: Record<WorkspaceCandidate['crm_status'], string> = {
  none:     'Not on CRM',
  active:   'On CRM',
  inactive: 'CRM disabled',
};

export function WorkspaceMembersCard() {
  const qc = useQueryClient();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkspaceCandidate | null>(null);
  const [editRole, setEditRole] = useState<'owner' | 'admin' | 'agent' | 'viewer'>('agent');
  const [editActive, setEditActive] = useState(true);
  const [editPresaleEmail, setEditPresaleEmail] = useState('');
  const [lastResult, setLastResult] = useState<{
    email: string;
    temp_password?: string;
    email_sent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['crm_team_workspace_candidates'],
    enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_team_list_workspace_candidates');
      if (error) throw error;
      return (data ?? []) as WorkspaceCandidate[];
    },
  });

  // Map of user_id → last sign-in timestamp (null = never signed in)
  const { data: signinByUser = {} } = useQuery({
    queryKey: ['crm_team_signin_info'],
    enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_team_member_signin_info');
      if (error) throw error;
      const map: Record<string, { last_sign_in_at: string | null; created_at: string | null }> = {};
      for (const r of (data ?? []) as any[]) {
        map[r.user_id] = {
          last_sign_in_at: r.last_sign_in_at,
          created_at: r.created_at,
        };
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        (c.full_name ?? '').toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const inviteMut = useMutation({
    mutationFn: async (vars: { c: WorkspaceCandidate; role: 'agent' | 'admin' | 'viewer' }) => {
      const { data, error } = await supabase.functions.invoke('crm-invite-agent', {
        body: {
          email: vars.c.email,
          display_name: vars.c.full_name || vars.c.email,
          role: vars.role,
          mode: 'temp_password',
          app_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Could not send invite');
      return data as { email: string; temp_password?: string; email_sent: boolean };
    },
    onMutate: ({ c }) => setPendingId(c.user_id),
    onSettled: () => setPendingId(null),
    onSuccess: (data) => {
      setLastResult({
        email: data.email,
        temp_password: data.temp_password,
        email_sent: data.email_sent,
      });
      qc.invalidateQueries({ queryKey: ['crm_team_workspace_candidates'] });
      qc.invalidateQueries({ queryKey: ['crm_team_invites'] });
      qc.invalidateQueries({ queryKey: ['crm_team_members'] });
      toast.success(
        data.email_sent
          ? 'Invite sent — they were emailed a temporary password'
          : 'Account ready — copy the temp password below to share manually',
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not send invite'),
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { user_id: string; role?: string; is_active?: boolean }) => {
      const { error } = await supabase.rpc('crm_team_update_member', {
        _user_id: vars.user_id,
        _role: vars.role ?? null,
        _is_active: vars.is_active ?? null,
        _display_name: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Team member updated');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['crm_team_workspace_candidates'] });
      qc.invalidateQueries({ queryKey: ['crm_team_members'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update'),
  });

  if (!isOwnerOrAdmin) return null;

  async function openEdit(c: WorkspaceCandidate) {
    setEditing(c);
    setEditRole((c.crm_role as any) ?? 'agent');
    setEditActive(c.crm_status !== 'inactive');
    setEditPresaleEmail('');
    // Fetch current presale_email override
    if (c.crm_team_id) {
      const { data } = await supabase
        .from('crm_team')
        .select('presale_email')
        .eq('id', c.crm_team_id)
        .maybeSingle();
      setEditPresaleEmail((data?.presale_email ?? '') as string);
    }
  }

  function copyPassword() {
    if (!lastResult?.temp_password) return;
    navigator.clipboard.writeText(lastResult.temp_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4 text-muted-foreground" />
          Workspace agents
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          People who already have a workspace login. Invite them onto the CRM team
          (we'll email them a temporary password) or edit an existing teammate's role.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Last invite result */}
        {lastResult && (
          <div className="rounded-lg border border-[#D7A542]/30 bg-[#D7A542]/5 p-3 space-y-2">
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#D7A542]">
              Invite sent · {lastResult.email}
            </div>
            {lastResult.temp_password && (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-sm">
                  {lastResult.temp_password}
                </code>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Shown once. They'll set their own password on first sign-in.
            </p>
          </div>
        )}

        {/* List */}
        {isLoading && (
          <div className="text-xs text-muted-foreground py-4">Loading workspace agents…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground py-4">No agents match.</div>
        )}

        <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
          {filtered.map((c) => (
            <CandidateRow
              key={c.user_id}
              candidate={c}
              isPending={pendingId === c.user_id}
              onInvite={(role) => inviteMut.mutate({ c, role })}
              onResend={() =>
                inviteMut.mutate({
                  c,
                  role: (c.crm_role === 'owner' || c.crm_role === 'admin' ? 'admin' : (c.crm_role as any) ?? 'agent'),
                })
              }
              onEdit={() => openEdit(c)}
            />
          ))}
        </div>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
            <DialogDescription>
              {editing?.full_name || editing?.email} · {editing?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Role</div>
              <Select value={editRole} onValueChange={(v: any) => setEditRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editing?.crm_role === 'owner' && (
                    <SelectItem value="owner">Owner</SelectItem>
                  )}
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label} <span className="text-muted-foreground">— {r.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {editActive ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <ShieldOff className="w-3.5 h-3.5 text-amber-500" />}
                  CRM access {editActive ? 'enabled' : 'disabled'}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Disabling keeps their workspace login but removes CRM data access.
                </div>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">
                Presale agent email <span className="text-muted-foreground/70">(optional override)</span>
              </div>
              <Input
                type="email"
                placeholder={editing?.email ?? 'agent@presaleproperties.com'}
                value={editPresaleEmail}
                onChange={(e) => setEditPresaleEmail(e.target.value)}
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Use when their login email differs from the email on their Presale Properties agent profile. Leave blank to match by login email.
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full justify-start text-sm"
              disabled={inviteMut.isPending}
              onClick={() => {
                if (!editing) return;
                inviteMut.mutate({ c: editing, role: editRole === 'owner' ? 'admin' : editRole });
                setEditing(null);
              }}
            >
              <KeyRound className="w-3.5 h-3.5 mr-2" />
              Reset password & re-send invite email
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={updateMut.isPending}
              onClick={async () => {
                if (!editing) return;
                // Persist presale_email override directly on crm_team
                if (editing.crm_team_id) {
                  const next = editPresaleEmail.trim().toLowerCase() || null;
                  const { error: peErr } = await supabase
                    .from('crm_team')
                    .update({ presale_email: next })
                    .eq('id', editing.crm_team_id);
                  if (peErr) {
                    toast.error(peErr.message);
                    return;
                  }
                }
                updateMut.mutate({
                  user_id: editing.user_id,
                  role: editRole,
                  is_active: editActive,
                });
              }}
            >
              {updateMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CandidateRow({
  candidate,
  isPending,
  onInvite,
  onResend,
  onEdit,
}: {
  candidate: WorkspaceCandidate;
  isPending: boolean;
  onInvite: (role: 'agent' | 'admin' | 'viewer') => void;
  onResend: () => void;
  onEdit: () => void;
}) {
  const [role, setRole] = useState<'agent' | 'admin' | 'viewer'>(
    (candidate.crm_role as any) === 'owner' || !candidate.crm_role
      ? 'agent'
      : (candidate.crm_role as any),
  );

  const onTeam = candidate.crm_status !== 'none';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {candidate.avatar_url ? (
          <img src={candidate.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[11px] font-semibold text-muted-foreground">
            {(candidate.full_name || candidate.email).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">
          {candidate.full_name || <span className="text-muted-foreground italic">No name</span>}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {candidate.email}
          <span className="mx-1.5 text-border">·</span>
          <span className={STATUS_TONE[candidate.crm_status]}>
            {STATUS_LABEL[candidate.crm_status]}
            {candidate.crm_role ? ` · ${candidate.crm_role}` : ''}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!onTeam && (
          <>
            <Select value={role} onValueChange={(v: any) => setRole(v)}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={isPending}
              onClick={() => onInvite(role)}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1.5" />Invite</>}
            </Button>
          </>
        )}
        {onTeam && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isPending}
              onClick={onResend}
              title="Generate a new temporary password and email it again"
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Resend</>
              )}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={onEdit}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
