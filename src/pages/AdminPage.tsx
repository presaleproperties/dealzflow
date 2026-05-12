import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Crown, DollarSign, UserPlus,
  Shield, ArrowUpCircle, ArrowDownCircle, Loader2,
  Search, X, Trash2, KeyRound, Pencil,
  ClipboardList, Eye, Pencil as PencilIcon, Trash, RotateCcw, 
  ChevronDown, ChevronRight, Ban, ShieldCheck, Calendar, Layers,
  Copy, Check,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useIsAdmin, useAdminAnalytics, useAdminUpdateSubscription, useAdminManageUser, useAdminAuditLogs, type AuditLog } from '@/hooks/useAdmin';
import { formatCurrency, formatDate } from '@/lib/format';
import { DataFlowMap } from '@/components/admin/DataFlowMap';
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid
} from 'recharts';
import { cn } from '@/lib/utils';
import { AccessRequestsCard } from '@/components/admin/AccessRequestsCard';
import { AgentOnboardingCard } from '@/components/admin/AgentOnboardingCard';

// ─── Compact stat pill ─────────────────────────────────────────────────────────
function StatPill({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card">
      <span className={cn('w-1.5 h-1.5 rounded-full', accent)} />
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: isCheckingAdmin } = useIsAdmin();
  const { data: analytics, isLoading, error } = useAdminAnalytics();
  const updateSubscription = useAdminUpdateSubscription();
  const manageUser = useAdminManageUser();
  const { data: auditLogs = [], isLoading: isLoadingAudit } = useAdminAuditLogs();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; isBanned: boolean } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [copiedMcp, setCopiedMcp] = useState(false);

  const MCP_ENDPOINT = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp-server`;
  const users = analytics?.users || [];
  
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const [showUsers, setShowUsers] = useState(true);
  const [showDataFlow, setShowDataFlow] = useState(false);

  useEffect(() => {
    if (!isCheckingAdmin && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, isCheckingAdmin, navigate]);

  if (isCheckingAdmin || isLoading) {
    return (
      <AppLayout>
        <Header title="Admin" showAddDeal={false} />
        <div className="p-4 lg:p-6 space-y-4">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) return null;

  if (error) {
    return (
      <AppLayout>
        <Header title="Admin" showAddDeal={false} />
        <div className="p-6 text-center">
          <p className="text-destructive">Error loading analytics: {error.message}</p>
        </div>
      </AppLayout>
    );
  }

  const summary = analytics?.summary;
  const signupsByMonth = analytics?.signupsByMonth || [];
  const conversionRate = summary?.totalUsers ? ((summary.proUsers / summary.totalUsers) * 100).toFixed(1) + '%' : '0%';

  return (
    <AppLayout>
      <Header 
        title="Admin"
        showAddDeal={false}
        action={
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">
            <Shield className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        }
      />

      <div className="p-4 lg:p-6 space-y-4 max-w-[1440px] mx-auto">
        
        {/* ── Compact stat bar ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="Users" value={summary?.totalUsers || 0} accent="bg-info" />
          <StatPill label="Pro" value={summary?.proUsers || 0} accent="bg-amber-500" />
          <StatPill label="Free" value={summary?.freeUsers || 0} accent="bg-muted-foreground" />
          <StatPill label="MRR" value={formatCurrency(summary?.mrr || 0)} accent="bg-success" />
          <StatPill label="7d signups" value={summary?.recentSignups || 0} accent="bg-primary" />
          <StatPill label="Deals" value={summary?.totalDeals || 0} accent="bg-indigo-500" />
          <StatPill label="CRM Contacts" value={summary?.crmContacts || 0} accent="bg-emerald-500" />
          <StatPill label="w/ Email" value={summary?.crmWithEmail || 0} accent="bg-teal-500" />
          <StatPill label="w/ Phone" value={summary?.crmWithPhone || 0} accent="bg-sky-500" />
          <StatPill label="30d New" value={summary?.crmRecent || 0} accent="bg-violet-500" />
          <StatPill label="Conv." value={conversionRate} accent="bg-cyan-500" />
          
          <button
            onClick={() => setShowChart(v => !v)}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 bg-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Calendar className="w-3 h-3" />
            Chart
            {showChart ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {/* ── MCP Endpoint ─────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">MCP</span>
          <code className="text-[11px] text-foreground font-mono truncate flex-1">{MCP_ENDPOINT}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(MCP_ENDPOINT);
              setCopiedMcp(true);
              setTimeout(() => setCopiedMcp(false), 2000);
            }}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiedMcp ? <><Check className="w-3 h-3 text-success" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
          </button>
        </div>

        {/* ── Quick admin links ─────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/zara')}>
            ✨ Zara AI Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/audit')}>
            Audit Log
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/projects')}>
            Projects
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/bridge-status')}>
            Bridge Status
          </Button>
        </div>

        {/* ── Signups Chart (collapsible) ──────────────────── */}
        {showChart && (
          <Card>
            <CardContent className="p-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={signupsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }} labelStyle={{ color: 'hsl(var(--popover-foreground))' }} itemStyle={{ color: 'hsl(var(--popover-foreground))' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Signups" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Workspace Access Requests ──────────────────── */}
        <AccessRequestsCard />

        {/* ── Agent Onboarding (link logins, set passwords) ── */}
        <AgentOnboardingCard />

        {/* ── Users Table (collapsible) ──────────────────── */}
        <Card>
          <CardHeader className="p-4 pb-3">
            <button onClick={() => setShowUsers(v => !v)} className="flex items-center gap-2 w-full text-left">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <CardTitle className="text-sm flex-1">Users ({users.length})</CardTitle>
              {showUsers ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            {showUsers && (
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-8 text-sm"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </CardHeader>
          {showUsers && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-2.5 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                    <th className="text-left p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Joined</th>
                    <th className="text-center p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                    <th className="text-center p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Deals</th>
                    <th className="text-center p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">GCI Goal</th>
                    <th className="text-right p-2.5 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                        {searchQuery ? `No users matching "${searchQuery}"` : 'No users yet'}
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map((user) => {
                    const isUpdating = updatingUserId === user.id;
                    const isPro = user.subscriptionTier === 'pro';
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const isNew = new Date(user.createdAt) >= oneDayAgo;

                    const handleSubscriptionChange = async () => {
                      setUpdatingUserId(user.id);
                      try {
                        await updateSubscription.mutateAsync({ targetUserId: user.id, tier: isPro ? 'free' : 'pro' });
                      } finally {
                        setUpdatingUserId(null);
                      }
                    };

                    return (
                      <tr key={user.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-primary">
                                {(user.name !== 'Unknown' ? user.name : user.email)?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate max-w-[160px]">
                                  {user.name !== 'Unknown' ? user.name : user.email}
                                </p>
                                {isNew && (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary">NEW</span>
                                )}
                                {user.isBanned && (
                                  <Badge variant="destructive" className="text-[9px] h-4 px-1">
                                    <Ban className="w-2 h-2 mr-0.5" />Ban
                                  </Badge>
                                )}
                              </div>
                              {user.name !== 'Unknown' && (
                                <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{user.email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5 hidden sm:table-cell">
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", isPro ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "")}>
                            {isPro ? <><Crown className="w-2.5 h-2.5 mr-0.5" />Pro</> : 'Free'}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-center hidden md:table-cell">
                          <span className="text-sm font-medium">{user.dealsCount}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">({user.closedDeals})</span>
                        </td>
                        <td className="p-2.5 text-center hidden lg:table-cell">
                          {user.yearlyGciGoal > 0 ? (
                            <span className="text-sm font-medium">{formatCurrency(user.yearlyGciGoal)}</span>
                          ) : (
                            <span className="text-muted-foreground/40 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="p-2.5 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant={isPro ? "outline" : "default"} className={cn("text-[10px] h-6 px-2", !isPro && "bg-amber-500 hover:bg-amber-600 text-white")} onClick={handleSubscriptionChange} disabled={isUpdating}>
                              {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : isPro ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Edit" onClick={() => { setEditTarget({ id: user.id, name: user.name, email: user.email }); setEditName(user.name === 'Unknown' ? '' : user.name); setEditEmail(user.email === 'Unknown' ? '' : user.email); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Reset password" onClick={async () => { await manageUser.mutateAsync({ action: 'reset_password', targetUserId: user.id }); }} disabled={manageUser.isPending}>
                              <KeyRound className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className={cn("h-6 w-6 p-0", user.isBanned ? "text-success" : "text-warning")} title={user.isBanned ? "Lift suspension" : "Suspend"} onClick={() => { setBanTarget({ id: user.id, name: user.name, isBanned: user.isBanned }); setBanReason(''); }}>
                              {user.isBanned ? <ShieldCheck className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" title="Delete" onClick={() => setDeleteTarget({ id: user.id, name: user.name })}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
          )}
        </Card>

        {/* ── Data Flow Map (collapsible) ──────────────────── */}
        <Card>
          <CardHeader className="p-4 pb-3">
            <button onClick={() => setShowDataFlow(v => !v)} className="flex items-center gap-2 w-full text-left">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <CardTitle className="text-sm flex-1">Data Flow Map</CardTitle>
              {showDataFlow ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showDataFlow && (
            <CardContent className="p-4 pt-0">
              <DataFlowMap />
            </CardContent>
          )}
        </Card>

        {/* ── Audit Log (collapsible) ──────────────────────── */}
        <Card>
          <CardHeader className="p-4 pb-3">
            <button onClick={() => setShowAuditLog(v => !v)} className="flex items-center gap-2 w-full text-left">
              <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
              <CardTitle className="text-sm flex-1">Audit Log</CardTitle>
              <span className="text-[10px] text-muted-foreground">{auditLogs.length}</span>
              {showAuditLog ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showAuditLog && (
            <CardContent className="p-0">
              {isLoadingAudit ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No entries yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left p-2.5 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">When</th>
                        <th className="text-left p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                        <th className="text-left p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Target</th>
                        <th className="text-left p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Details</th>
                        <th className="text-left p-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.slice(0, 50).map((log) => (
                        <AuditLogRow key={log.id} log={log} users={users} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the user and all their data. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleteTarget) return; await manageUser.mutateAsync({ action: 'delete', targetUserId: deleteTarget.id }); setDeleteTarget(null); }}>
              {manageUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email address" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={async () => { if (!editTarget) return; await manageUser.mutateAsync({ action: 'edit', targetUserId: editTarget.id, name: editName, email: editEmail }); setEditTarget(null); }} disabled={manageUser.isPending}>
              {manageUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban / Unban Dialog */}
      <AlertDialog open={!!banTarget} onOpenChange={(open) => !open && setBanTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{banTarget?.isBanned ? `Lift suspension for "${banTarget?.name}"?` : `Suspend "${banTarget?.name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>{banTarget?.isBanned ? 'This will restore login access immediately.' : 'This will block the user from logging in.'}</AlertDialogDescription>
          </AlertDialogHeader>
          {!banTarget?.isBanned && (
            <div className="px-1 pb-1">
              <Label className="text-sm">Reason (optional)</Label>
              <Input className="mt-1.5" placeholder="e.g. Terms of service violation" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={banTarget?.isBanned ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'} onClick={async () => { if (!banTarget) return; await manageUser.mutateAsync({ action: banTarget.isBanned ? 'unban' : 'ban', targetUserId: banTarget.id, banReason: banReason || undefined }); setBanTarget(null); }}>
              {manageUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : banTarget?.isBanned ? 'Lift Suspension' : 'Suspend User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

// ─── Audit log helpers ─────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  view_users:     { label: 'Viewed users',     icon: Eye,        color: 'text-info' },
  delete:         { label: 'Deleted user',      icon: Trash,      color: 'text-destructive' },
  reset_password: { label: 'Reset password',    icon: RotateCcw,  color: 'text-amber-500' },
  edit:           { label: 'Edited user',       icon: PencilIcon, color: 'text-primary' },
  ban:            { label: 'Suspended user',    icon: Ban,        color: 'text-destructive' },
  unban:          { label: 'Lifted suspension', icon: ShieldCheck, color: 'text-success' },
};

function AuditLogRow({ log, users }: { log: AuditLog; users: { id: string; name: string; email: string }[] }) {
  const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, icon: ClipboardList, color: 'text-muted-foreground' };
  const Icon = cfg.icon;
  const target = users.find(u => u.id === log.target_user_id);
  const targetLabel = target ? (target.name !== 'Unknown' ? target.name : target.email) : log.target_user_id ? log.target_user_id.slice(0, 8) + '…' : '—';
  const details = log.details ? Object.entries(log.details).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ') : '—';

  return (
    <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors">
      <td className="p-2.5 px-4 text-[11px] text-muted-foreground whitespace-nowrap">
        {format(new Date(log.created_at), 'MMM d, HH:mm')}
      </td>
      <td className="p-2.5">
        <span className={`flex items-center gap-1.5 text-[11px] font-medium ${cfg.color}`}>
          <Icon className="w-3 h-3 shrink-0" />
          {cfg.label}
        </span>
      </td>
      <td className="p-2.5 hidden sm:table-cell">
        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[140px] block">{targetLabel}</span>
      </td>
      <td className="p-2.5 hidden md:table-cell">
        <span className="text-[11px] text-muted-foreground truncate max-w-[200px] block">{details}</span>
      </td>
      <td className="p-2.5 hidden lg:table-cell">
        <span className="text-[11px] text-muted-foreground font-mono">{log.ip_address || '—'}</span>
      </td>
    </tr>
  );
}
