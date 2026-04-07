import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { toast } from 'sonner';
import {
  Shield, Lock, UserPlus, GripVertical, Plus, Bell,
  MessageSquare, Mail, Calendar, Megaphone, Database,
} from 'lucide-react';
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
import { useEffect } from 'react';

const PIPELINE_STAGES = [
  'New Lead', 'Contacted', 'Nurturing', 'Hot / Engaged',
  'Showing Booked', 'Offer Made', 'Closed', 'Lost / Cold',
];

const LEAD_SOURCES = [
  'Facebook Ad', 'Website Form', 'Manual Entry', 'Referral', 'TikTok', 'Instagram',
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
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground">CRM Settings</h1>
      <TeamManagement />
      <Separator />
      <PipelineStages />
      <Separator />
      <LeadSourcesSection />
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
      // We can't look up auth.users from the client. Insert with a placeholder user_id
      // and match by email. The admin RLS allows inserting.
      // For now, insert with a generated UUID – the owner must ensure the email user exists.
      const { error } = await supabase.from('crm_team').insert({
        user_id: crypto.randomUUID(), // placeholder – real flow would look up by email
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Team Management</CardTitle>
          <span className="text-sm text-muted-foreground ml-2">
            {members.length} of unlimited team members
          </span>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" /> Invite Team Member
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
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
                  <TableCell className="font-medium flex items-center gap-2">
                    {isOwner && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                    {m.display_name || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email || '—'}</TableCell>
                  <TableCell>
                    {isOwner ? (
                      <Badge variant="outline" className={roleBadgeColor('owner')}>owner</Badge>
                    ) : (
                      <Select
                        value={m.role}
                        onValueChange={(v) => updateRole.mutate({ id: m.id, role: v })}
                      >
                        <SelectTrigger className="w-28 h-7 text-xs">
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
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(m.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isOwner && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {m.display_name || m.email} will lose access to the CRM. This action cannot be undone.
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
      </CardContent>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
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
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input
                placeholder="Jane Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              This person needs a Dealzflow account first. If they haven't signed up yet, ask them to create one with this email.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              disabled={!inviteEmail || inviteMember.isPending}
              onClick={() => inviteMember.mutate()}
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pipeline Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-muted/30 border border-border/40">
            <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
            <span className="text-sm font-medium text-foreground">{stage}</span>
            <span className="ml-auto text-xs text-muted-foreground">Stage {i + 1}</span>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lead Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {sources.map(s => (
            <Badge key={s} variant="outline" className="text-sm py-1 px-3">{s}</Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="New source name"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSource()}
            className="max-w-xs"
          />
          <Button variant="outline" size="sm" onClick={addSource} disabled={!newSource.trim()}>
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
  const statusBadge = (status: 'connected' | 'disconnected' | 'migrating') => {
    if (status === 'connected') return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Connected</Badge>;
    if (status === 'disconnected') return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Disconnected</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Migrating</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map(intg => (
          <div key={intg.name} className="flex items-start gap-3 p-4 rounded-lg border border-border/60 bg-muted/20">
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
                <Button variant="outline" size="sm" className="mt-2 h-7 text-xs">Reconnect</Button>
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
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_DEFAULTS.map(n => [n.key, true]))
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <CardTitle className="text-lg">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {NOTIFICATION_DEFAULTS.map(n => (
          <div key={n.key} className="flex items-center justify-between py-1">
            <span className="text-sm text-foreground">{n.label}</span>
            <Switch
              checked={toggles[n.key]}
              onCheckedChange={(v) => setToggles(prev => ({ ...prev, [n.key]: v }))}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
