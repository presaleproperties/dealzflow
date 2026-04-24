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
} from 'lucide-react';
import {
  getTimelineLinkBehavior,
  setTimelineLinkBehavior,
  type TimelineLinkBehavior,
} from '@/lib/timelineLinkPref';
import DataImportSection from '@/components/crm/settings/DataImportSection';
import DataManagerSection from '@/components/crm/settings/DataManagerSection';
import EmailSettingsSection from '@/components/crm/settings/EmailSettingsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
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

const SETTINGS_SECTIONS = [
  { id: 'settings-team', label: 'Team', icon: Shield },
  { id: 'settings-import', label: 'Import', icon: Database },
  { id: 'settings-data', label: 'Data Manager', icon: Database },
  { id: 'settings-integrations', label: 'Integrations', icon: MessageSquare },
  { id: 'settings-email', label: 'Email', icon: Mail },
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
    <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 h-full min-h-0">
      {/* Mobile/Tablet: horizontal tab bar */}
      <div className="lg:hidden overflow-x-auto border-b border-border bg-background sticky top-0 z-10 -mx-3 -mt-3 px-3 sm:-mx-4 sm:-mt-4 sm:px-4">
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
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto pb-20 lg:pb-24 space-y-6 sm:space-y-8 max-w-3xl">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground lg:hidden">CRM Settings</h1>

        <div id="settings-team" className="scroll-mt-16">
          <SectionErrorBoundary name="Team Management"><TeamManagement /></SectionErrorBoundary>
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
        <div id="settings-integrations" className="scroll-mt-16">
          <SectionErrorBoundary name="Integrations"><IntegrationsSection /></SectionErrorBoundary>
        </div>
        <Separator />
        <div id="settings-email" className="scroll-mt-16">
          <SectionErrorBoundary name="Email Settings"><EmailSettingsSection /></SectionErrorBoundary>
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
function TeamManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('agent');
  const [inviteName, setInviteName] = useState('');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['crm-team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from('crm_team').update({ role }).eq('id', id);
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
      const { error } = await supabase.from('crm_team').update({ is_active }).eq('id', id);
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

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('crm_team').insert({
        user_id: crypto.randomUUID(),
        email: inviteEmail,
        display_name: inviteName || null,
        role: inviteRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Team member added');
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

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-base sm:text-lg">Team Management</CardTitle>
          <span className="text-xs sm:text-sm text-muted-foreground ml-1 sm:ml-2">
            {members.length} members
          </span>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)} className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
          <UserPlus className="h-4 w-4 mr-1.5" /> Invite
        </Button>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {members.map(m => {
                const isOwner = m.role === 'owner';
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {isOwner && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="truncate">{m.display_name || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">{m.email || '—'}</TableCell>
                    <TableCell>
                      {isOwner ? (
                        <Badge variant="outline" className={roleBadgeColor('owner')}>owner</Badge>
                      ) : (
                        <Select
                          value={m.role}
                          onValueChange={(v) => updateRole.mutate({ id: m.id, role: v })}
                        >
                          <SelectTrigger className="w-24 sm:w-28 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="agent">agent</SelectItem>
                            <SelectItem value="viewer">viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isOwner ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Active</Badge>
                      ) : (
                        <Switch
                          checked={m.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: m.id, is_active: v })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                      {format(new Date(m.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isOwner && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive min-h-[44px] sm:min-h-0">
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

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
              This person needs an account first. Ask them to sign up with this email.
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
