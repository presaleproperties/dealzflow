import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

/* ── Error Boundary ── */
class SectionErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] section error:`, error, info);
  }
  handleRetry = () => {
    this.setState({ hasError: false });
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[10px] lg:rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              This integration encountered an error. Please check your API key in Settings.
            </p>
            <p className="text-xs text-muted-foreground">
              {this.props.name} failed to load. Other sections are unaffected.
            </p>
            <Button variant="outline" size="sm" onClick={this.handleRetry} className="h-7 text-xs mt-1">
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Shield, Lock, UserPlus, GripVertical, Plus, Bell,
  MessageSquare, Mail, Calendar, Megaphone, Database, Link2,
  User, ArrowUpRight, RefreshCw, Loader2, Phone, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  getTimelineLinkBehavior,
  setTimelineLinkBehavior,
  type TimelineLinkBehavior,
} from '@/lib/timelineLinkPref';
import DataImportSection from '@/components/crm/settings/DataImportSection';
import DataManagerSection from '@/components/crm/settings/DataManagerSection';
import EmailSettingsSection from '@/components/crm/settings/EmailSettingsSection';
import ProjectsManagerSection from '@/components/crm/settings/ProjectsManagerSection';
import GmailConnectCard from '@/components/crm/email/GmailConnectCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';



const INTEGRATIONS = [
  { name: 'Google Calendar', icon: Calendar, status: 'connected' as const, desc: 'Sync showings and appointments' },
];

const NOTIFICATION_DEFAULTS = [
  { key: 'new_lead', label: 'New Lead Alert' },
  { key: 'showing_reminder', label: 'Showing Reminder (1hr before)' },
  { key: 'task_due', label: 'Task Due Reminder' },
  { key: 'email_opened', label: 'Email Opened Alert' },
];

// Re-ordered into a logical hierarchy:
//   Profile → who you are
//   Team → who else has access
//   Email → outbound comms
//   Integrations → external connections
//   Pipeline data → what flows in (Projects, Import, Data Manager)
//   Preferences → notifications, timeline behavior
const SETTINGS_SECTIONS = [
  { id: 'settings-profile', label: 'Profile', icon: User },
  { id: 'settings-team', label: 'Team', icon: Shield },
  { id: 'settings-email', label: 'Email', icon: Mail },
  { id: 'settings-integrations', label: 'Integrations', icon: MessageSquare },
  { id: 'settings-projects', label: 'Projects', icon: Link2 },
  { id: 'settings-import', label: 'Import', icon: Database },
  { id: 'settings-data', label: 'Data Manager', icon: Database },
  { id: 'settings-notifications', label: 'Notifications', icon: Bell },
  { id: 'settings-timeline', label: 'Timeline', icon: Link2 },
] as const;

export default function CrmSettingsPage() {
  const { isOwnerOrAdmin, isLoading: accessLoading } = useCrmAccess();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<string>(SETTINGS_SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessLoading && !isOwnerOrAdmin) {
      navigate('/crm', { replace: true });
    }
  }, [accessLoading, isOwnerOrAdmin, navigate]);

  // Intersection Observer to track active section
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root: container, rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    SETTINGS_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [accessLoading, isOwnerOrAdmin]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (accessLoading || !isOwnerOrAdmin) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 h-full min-h-0 crm-mobile-page">
      {/* Mobile/Tablet: horizontal tab bar */}
      <div className="lg:hidden overflow-x-auto border-b border-border bg-background sticky top-0 z-10 -mx-3 -mt-3 px-3 sm:-mx-4 sm:-mt-4 sm:px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex gap-1 py-2 min-w-max">
          {SETTINGS_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeSection === id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: sticky sidebar nav */}
      <nav className="hidden lg:flex flex-col w-44 shrink-0 sticky top-0 self-start pt-1">
        <h1 className="text-lg font-bold text-foreground mb-4">CRM Settings</h1>
        <div className="space-y-0.5">
          {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors text-left ${
                activeSection === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main content — scrollable */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto space-y-6 sm:space-y-8 max-w-3xl">
        <h1 className="m-page-title lg:hidden">CRM Settings</h1>

        <div id="settings-profile" className="scroll-mt-16">
          <SectionErrorBoundary name="Profile"><ProfileLinkCard /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-team" className="scroll-mt-16">
          <SectionErrorBoundary name="Team Management"><TeamManagement /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-email" className="scroll-mt-16">
          <SectionErrorBoundary name="Email Settings"><EmailSettingsSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-integrations" className="scroll-mt-16">
          <SectionErrorBoundary name="Integrations"><IntegrationsSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-projects" className="scroll-mt-16">
          <SectionErrorBoundary name="Projects"><ProjectsManagerSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-import" className="scroll-mt-16">
          <SectionErrorBoundary name="Data Import"><DataImportSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-data" className="scroll-mt-16">
          <SectionErrorBoundary name="Data Manager"><DataManagerSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-notifications" className="scroll-mt-16">
          <SectionErrorBoundary name="Notifications"><NotificationsSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-timeline" className="scroll-mt-16">
          <SectionErrorBoundary name="Timeline"><TimelinePreferencesSection /></SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   1. Team Management
   ══════════════════════════════════════════ */
type TeamPerms = {
  see_all_leads?: boolean;
  delete_leads?: boolean;
  export_leads?: boolean;
  reassign_leads?: boolean;
  manage_templates?: boolean;
  manage_routing?: boolean;
  manage_team?: boolean;
};

const PERMISSION_LIST: { key: keyof TeamPerms; label: string; desc: string }[] = [
  { key: 'see_all_leads', label: 'See all leads', desc: 'View every lead in the workspace, not just assigned ones.' },
  { key: 'reassign_leads', label: 'Reassign leads', desc: 'Change which agent a lead belongs to.' },
  { key: 'delete_leads', label: 'Delete leads', desc: 'Permanently remove leads from the CRM.' },
  { key: 'export_leads', label: 'Export leads', desc: 'Download lead lists as CSV.' },
  { key: 'manage_templates', label: 'Manage templates', desc: 'Create and edit shared email/SMS templates.' },
  { key: 'manage_routing', label: 'Manage routing', desc: 'Configure lead routing rules and assignments.' },
  { key: 'manage_team', label: 'Manage team', desc: 'Invite and manage other team members.' },
];

function TeamManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('agent');
  const [inviteName, setInviteName] = useState('');
  const [permsEditId, setPermsEditId] = useState<string | null>(null);
  const [permsDraft, setPermsDraft] = useState<TeamPerms>({});

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['crm-team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('id,user_id,display_name,email,phone,title,brokerage,headshot_url,headshot_focal_y,role,is_active,permissions,created_at,presale_synced_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [syncing, setSyncing] = useState(false);
  const syncFromPresale = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduler-prefill-team', { body: {} });
      if (error) throw error;
      const results = (data?.results || []) as Array<{ status: string }>;
      const synced  = results.filter((r) => r.status === 'synced').length;
      const missing = results.filter((r) => r.status === 'no_presale_match').length;
      toast.success(`Synced ${synced} of ${results.length} from Presale${missing ? ` · ${missing} unmatched` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.rpc('crm_team_update', {
        _team_id: id, _role: role, _permissions: null, _is_active: null, _name_aliases: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Role updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc('crm_team_update', {
        _team_id: id, _role: null, _permissions: null, _is_active: is_active, _name_aliases: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_team').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Member removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePerms = useMutation({
    mutationFn: async ({ id, perms }: { id: string; perms: TeamPerms }) => {
      const { error } = await supabase.rpc('crm_team_update', {
        _team_id: id, _role: null, _permissions: perms as any, _is_active: null, _name_aliases: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Permissions updated');
      setPermsEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('crm_team_invite', {
        _email: inviteEmail.trim(),
        _display_name: inviteName.trim(),
        _role: inviteRole,
        _permissions: {} as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Team member invited. They will be linked when they sign up.');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('agent');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleBadgeColor = (role: string) => {
    if (role === 'owner') return 'bg-primary/15 text-primary border-primary/30';
    if (role === 'admin') return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    if (role === 'agent') return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  const initialsOf = (name?: string | null, email?: string | null) =>
    ((name || email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?');

  const relativeSync = (iso?: string | null) => {
    if (!iso) return null;
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4.5 w-4.5 text-primary shrink-0" />
          <CardTitle className="text-base sm:text-lg">Team Management</CardTitle>
          <span className="text-xs sm:text-sm text-muted-foreground ml-1">· {members.length} {members.length === 1 ? 'member' : 'members'}</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={syncFromPresale}
            disabled={syncing}
            className="flex-1 sm:flex-none"
          >
            {syncing
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Syncing</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync from Presale</>}
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)} className="flex-1 sm:flex-none">
            <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-5">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[150px] rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No team members yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {members.map((m: any) => {
              const isOwner = m.role === 'owner';
              const focalY = m.headshot_focal_y ?? 30;
              const missing: string[] = [];
              if (!m.headshot_url) missing.push('headshot');
              if (!m.title)        missing.push('title');
              if (!m.phone)        missing.push('phone');
              const synced = relativeSync(m.presale_synced_at);

              return (
                <div
                  key={m.id}
                  className="group relative rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    {m.headshot_url ? (
                      <img
                        src={m.headshot_url}
                        alt={m.display_name || ''}
                        className="w-14 h-14 rounded-full object-cover border border-border shrink-0"
                        style={{ objectPosition: `center ${focalY}%` }}
                      />
                    ) : (
                      <Avatar className="w-14 h-14 shrink-0 border border-border">
                        <AvatarFallback
                          className="text-sm font-medium text-white"
                          style={{ background: 'hsl(var(--primary))', fontFamily: 'Georgia, serif' }}
                        >
                          {initialsOf(m.display_name, m.email)}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isOwner && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <h4 className="text-[14px] font-semibold text-foreground leading-tight truncate">
                          {m.display_name || '—'}
                        </h4>
                      </div>
                      {m.title ? (
                        <div className="text-[12px] text-foreground/70 truncate mt-0.5">{m.title}</div>
                      ) : (
                        <div className="text-[12px] italic text-muted-foreground/70 mt-0.5">No title</div>
                      )}
                      <div className="mt-1.5 space-y-0.5">
                        {m.email && (
                          <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{m.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <Phone className="w-3 h-3 shrink-0" />
                          {m.phone ? <span>{m.phone}</span> : <span className="italic">No phone</span>}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {isOwner ? (
                        <Badge variant="outline" className={roleBadgeColor('owner')}>owner</Badge>
                      ) : (
                        <Select
                          value={m.role}
                          onValueChange={(v) => updateRole.mutate({ id: m.id, role: v })}
                        >
                          <SelectTrigger className="w-[92px] h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="agent">agent</SelectItem>
                            <SelectItem value="viewer">viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {!isOwner && (
                        <Switch
                          checked={m.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: m.id, is_active: v })}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-[10.5px] flex-wrap">
                      {missing.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3 h-3" /> Missing {missing.join(', ')}
                        </span>
                      )}
                      {synced && <span className="text-muted-foreground">· Synced {synced}</span>}
                      {!m.user_id && <span className="text-amber-600 dark:text-amber-500">· Awaiting signup</span>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {!isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setPermsEditId(m.id);
                            setPermsDraft((m.permissions ?? {}) as TeamPerms);
                          }}
                        >
                          Permissions
                        </Button>
                      )}
                      {!isOwner && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 px-2 text-[11px]">
                              Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {m.display_name || m.email} will lose access to the CRM.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeMember.mutate(m.id)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Permissions Dialog */}
      <Dialog open={!!permsEditId} onOpenChange={(o) => !o && setPermsEditId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {PERMISSION_LIST.map(p => (
              <div key={p.key} className="flex items-start justify-between gap-3 py-1">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
                <Switch
                  checked={!!permsDraft[p.key]}
                  onCheckedChange={(v) => setPermsDraft((d) => ({ ...d, [p.key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermsEditId(null)}>Cancel</Button>
            <Button
              disabled={savePerms.isPending}
              onClick={() => permsEditId && savePerms.mutate({ id: permsEditId, perms: permsDraft })}
            >
              {savePerms.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="team@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="min-h-[44px] sm:min-h-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input
                placeholder="Jane Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="min-h-[44px] sm:min-h-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="min-h-[44px] sm:min-h-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              They'll be auto-linked when they sign up with this email. Their Presale headshot &amp; signature pull automatically on first login.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="min-h-[44px] sm:min-h-0">Cancel</Button>
            <Button
              disabled={!inviteEmail || inviteMember.isPending}
              onClick={() => inviteMember.mutate()}
              className="min-h-[44px] sm:min-h-0"
            >
              {inviteMember.isPending ? 'Adding…' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


/* ══════════════════════════════════════════
   4. Integrations
   ══════════════════════════════════════════ */
function IntegrationsSection() {
  const statusBadge = (status: 'connected' | 'disconnected' | 'error' | 'unknown') => {
    if (status === 'connected') return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Connected</Badge>;
    if (status === 'error') return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Error</Badge>;
    if (status === 'unknown') return <Badge className="bg-muted text-muted-foreground border-border" variant="outline">Unknown</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Not Connected</Badge>;
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 grid-cols-1 sm:grid-cols-2 px-3 sm:px-6">
        <GmailConnectCard />
        {INTEGRATIONS.map(intg => (
          <div key={intg.name} className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border border-border/60 bg-muted/20">
            <div className="p-2 rounded-md bg-primary/10 shrink-0">
              <intg.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-foreground">{intg.name}</span>
                {statusBadge(intg.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{intg.desc}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════
   5. Notifications
   ══════════════════════════════════════════ */
function NotificationsSection() {
  const DEFAULTS: Record<string, boolean> = {
    new_lead: true,
    showing_reminder: true,
    task_due: true,
    email_opened: false,
  };

  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('crm-notification-toggles');
      if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
    } catch {}
    return DEFAULTS;
  });

  const handleToggle = (key: string, value: boolean) => {
    const next = { ...toggles, [key]: value };
    setToggles(next);
    localStorage.setItem('crm-notification-toggles', JSON.stringify(next));
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Bell className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 sm:space-y-3 px-3 sm:px-6">
        {NOTIFICATION_DEFAULTS.map(n => (
          <div key={n.key} className="flex items-center justify-between py-2 sm:py-1 min-h-[44px]">
            <span className="text-sm text-foreground">{n.label}</span>
            <Switch
              checked={toggles[n.key]}
              onCheckedChange={(v) => handleToggle(n.key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════
   6. Timeline preferences (link click behavior)
   ══════════════════════════════════════════ */
function TimelinePreferencesSection() {
  const [behavior, setBehaviorState] = useState<TimelineLinkBehavior>(() => getTimelineLinkBehavior());

  const handleChange = (value: TimelineLinkBehavior) => {
    setBehaviorState(value);
    setTimelineLinkBehavior(value);
  };

  const options: { value: TimelineLinkBehavior; title: string; desc: string }[] = [
    {
      value: 'preview',
      title: 'Show preview first',
      desc: 'Click a link to see its host, path and query params before opening.',
    },
    {
      value: 'open',
      title: 'Open immediately in a new tab',
      desc: 'Skip the preview popover and go straight to the destination.',
    },
  ];

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Link2 className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Timeline Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <p className="text-xs text-muted-foreground">
          Choose what happens when you click a URL inside a lead's activity timeline.
        </p>
        <div className="space-y-2">
          {options.map((opt) => {
            const active = behavior === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange(opt.value)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                      active ? 'border-primary' : 'border-muted-foreground/40'
                    }`}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{opt.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground/80">
          Saved on this device. Click tracking still records every link you open.
        </p>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════
   7. Profile (link card → global Profile editor)
   ══════════════════════════════════════════ */
function ProfileLinkCard() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const navigate = useNavigate();

  const fullName = profile?.full_name || user?.user_metadata?.full_name || '';
  const initials =
    (fullName || user?.email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const isComplete = Boolean(profile?.avatar_url && profile?.full_name && profile?.title && profile?.phone);

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <User className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Your Profile</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <div className="h-16 animate-pulse bg-muted/40 rounded-lg" />
        ) : (
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-border/60">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={fullName || 'Profile'} />
              <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {fullName || 'Add your name'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.title || 'Add your title'}
              </p>
              <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                {user?.email}
              </p>
            </div>
            {!isComplete && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                Incomplete
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/settings?tab=profile')}
              className="shrink-0"
            >
              Edit profile
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Your profile is shared across Dealzflow and the CRM. Edit it once and it appears in
          your email signatures, lead pages, and team directory.
        </p>
      </CardContent>
    </Card>
  );
}
