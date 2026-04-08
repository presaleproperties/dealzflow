import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { toast } from 'sonner';
import {
  Shield, Lock, UserPlus, GripVertical, Plus, Bell,
  MessageSquare, Mail, Calendar, Megaphone, Database,
} from 'lucide-react';
import DataImportSection from '@/components/crm/settings/DataImportSection';
import DataManagerSection from '@/components/crm/settings/DataManagerSection';
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
import { useGmailStatus, useConnectGmail, useDisconnectGmail } from '@/hooks/useGmail';

const PIPELINE_STAGES = [
  'New Lead', 'Contacted', 'Nurturing', 'Hot / Engaged',
  'Showing Booked', 'Offer Made', 'Closed', 'Lost / Cold',
];

const LEAD_SOURCES = [
  'Facebook Ad', 'Instagram', 'TikTok', 'Website Form', 'presaleproperties.com', 'Calendly', 'WhatsApp', 'Referral', 'Manual Entry',
];

const INTEGRATIONS = [
  { name: 'WhatsApp Business (Twilio)', icon: MessageSquare, status: 'connected' as const, desc: 'Two-way messaging with leads via WhatsApp' },
  { name: 'MailerLite', icon: Mail, status: 'connected' as const, desc: 'Email campaigns and automation' },
  { name: 'Google Calendar', icon: Calendar, status: 'connected' as const, desc: 'Sync showings and appointments' },
  { name: 'Facebook Ads', icon: Megaphone, status: 'disconnected' as const, desc: 'Lead generation from Meta ad campaigns' },
  { name: 'Lofty CRM', icon: Database, status: 'migrating' as const, desc: 'Legacy CRM data migration' },
];

const NOTIFICATION_DEFAULTS = [
  { key: 'new_lead', label: 'New Lead Alert' },
  { key: 'showing_reminder', label: 'Showing Reminder (1hr before)' },
  { key: 'task_due', label: 'Task Due Reminder' },
  { key: 'email_opened', label: 'Email Opened Alert' },
  { key: 'whatsapp_reply', label: 'WhatsApp Reply Alert' },
];

export default function CrmSettingsPage() {
  const { isOwnerOrAdmin, isLoading: accessLoading } = useCrmAccess();
  const navigate = useNavigate();

  useEffect(() => {
    if (!accessLoading && !isOwnerOrAdmin) {
      navigate('/crm', { replace: true });
    }
  }, [accessLoading, isOwnerOrAdmin, navigate]);

  if (accessLoading || !isOwnerOrAdmin) return null;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">CRM Settings</h1>
      <TeamManagement />
      <Separator />
      <PipelineStages />
      <Separator />
      <LeadSourcesSection />
      <Separator />
      <DataImportSection />
      <Separator />
      <DataManagerSection />
      <Separator />
      <IntegrationsSection />
      <Separator />
      <NotificationsSection />
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
   2. Pipeline Stages
   ══════════════════════════════════════════ */
function PipelineStages() {
  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Pipeline Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 sm:px-6">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-md bg-muted/30 border border-border/40 min-h-[40px]">
            <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{stage}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">Stage {i + 1}</span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground pt-2">Drag-to-reorder coming soon.</p>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════
   3. Lead Sources
   ══════════════════════════════════════════ */
function LeadSourcesSection() {
  const [sources, setSources] = useState(LEAD_SOURCES);
  const [newSource, setNewSource] = useState('');

  const addSource = () => {
    const trimmed = newSource.trim();
    if (trimmed && !sources.includes(trimmed)) {
      setSources([...sources, trimmed]);
      setNewSource('');
      toast.success(`Added "${trimmed}"`);
    }
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Lead Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {sources.map(s => (
            <Badge key={s} variant="outline" className="text-sm py-1 px-3">{s}</Badge>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="New source name"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSource()}
            className="sm:max-w-xs min-h-[44px] sm:min-h-0"
          />
          <Button variant="outline" size="sm" onClick={addSource} disabled={!newSource.trim()} className="min-h-[44px] sm:min-h-0">
            <Plus className="h-4 w-4 mr-1" /> Add Source
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════
   4. Integrations
   ══════════════════════════════════════════ */
function IntegrationsSection() {
  const { data: gmailStatus } = useGmailStatus();
  const connectGmail = useConnectGmail();
  const disconnectGmail = useDisconnectGmail();

  // Handle Gmail OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailAuth = params.get('gmail_auth');
    if (gmailAuth === 'success') {
      toast.success('Gmail connected successfully');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmailAuth === 'error') {
      toast.error(params.get('message') || 'Gmail connection failed');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const statusBadge = (status: 'connected' | 'disconnected' | 'migrating') => {
    if (status === 'connected') return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Connected</Badge>;
    if (status === 'disconnected') return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Disconnected</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Migrating</Badge>;
  };

  const handleConnectGmail = () => {
    connectGmail.mutate(window.location.origin + '/crm/settings');
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 grid-cols-1 sm:grid-cols-2 px-3 sm:px-6">
        {/* Gmail integration - dynamic */}
        <div className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border border-border/60 bg-muted/20">
          <div className="p-2 rounded-md bg-primary/10 shrink-0">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground">Gmail</span>
              {gmailStatus?.connected
                ? statusBadge('connected')
                : statusBadge('disconnected')
              }
            </div>
            {gmailStatus?.connected && gmailStatus.gmailEmail ? (
              <p className="text-xs text-muted-foreground mt-1">Connected as {gmailStatus.gmailEmail}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Send individual emails to contacts via Gmail</p>
            )}
            {gmailStatus?.connected ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs min-h-[36px] sm:min-h-0"
                onClick={() => disconnectGmail.mutate()}
                disabled={disconnectGmail.isPending}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs min-h-[36px] sm:min-h-0"
                onClick={handleConnectGmail}
                disabled={connectGmail.isPending}
              >
                Connect Gmail
              </Button>
            )}
          </div>
        </div>

        {/* Static integrations */}
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
              {intg.status === 'disconnected' && (
                <Button variant="outline" size="sm" className="mt-2 h-7 text-xs min-h-[36px] sm:min-h-0">Reconnect</Button>
              )}
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
    whatsapp_reply: true,
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
