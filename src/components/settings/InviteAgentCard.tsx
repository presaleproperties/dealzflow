import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Mail, Copy, Check, X, Loader2, Send, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface InviteRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  pending:  { text: 'Pending',  tone: 'text-amber-500' },
  accepted: { text: 'Accepted', tone: 'text-emerald-500' },
  revoked:  { text: 'Revoked',  tone: 'text-muted-foreground' },
  expired:  { text: 'Expired',  tone: 'text-muted-foreground' },
};

export function InviteAgentCard() {
  const qc = useQueryClient();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);
  const [lastEmailRecipient, setLastEmailRecipient] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'pw' | null>(null);

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['crm_team_invites'],
    enabled: isOwnerOrAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_team_list_invites');
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-invite-agent', {
        body: {
          email: email.trim(),
          display_name: name.trim(),
          role: 'agent',
          mode: 'temp_password',
          app_origin: window.location.origin,
          personal_note: note.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Could not send invite');
      return data as {
        mode?: 'temp_password' | 'set_password';
        accept_url?: string;
        login_url?: string;
        email?: string;
        temp_password?: string;
        email_sent: boolean;
        warning?: string;
      };
    },
    onSuccess: (data) => {
      setLastUrl(data.login_url ?? data.accept_url ?? null);
      setLastTempPassword(data.temp_password ?? null);
      setLastEmailRecipient(data.email ?? email.trim());
      setName(''); setEmail(''); setNote('');
      qc.invalidateQueries({ queryKey: ['crm_team_invites'] });
      if (data.email_sent) {
        toast.success('Invite sent', {
          description: data.mode === 'temp_password'
            ? 'They got an email with a temporary password and will be asked to set their own.'
            : "They'll get an email with a link to set their password.",
        });
      } else {
        toast.warning('Invite created — email not sent', {
          description: data.warning ?? 'Copy the details below to share manually.',
        });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not send invite'),
  });

  const revokeMut = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('crm_team_revoke_invite', { _invite_id: inviteId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Invite revoked');
      qc.invalidateQueries({ queryKey: ['crm_team_invites'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not revoke'),
  });

  const resendMut = useMutation({
    mutationFn: async (inv: InviteRow) => {
      const { data, error } = await supabase.functions.invoke('crm-invite-agent', {
        body: {
          email: inv.email,
          display_name: inv.display_name,
          role: inv.role || 'agent',
          mode: 'temp_password',
          app_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Could not resend invite');
      return data as { email?: string; temp_password?: string; login_url?: string; email_sent: boolean };
    },
    onSuccess: (data, inv) => {
      setLastUrl(data.login_url ?? null);
      setLastTempPassword(data.temp_password ?? null);
      setLastEmailRecipient(data.email ?? inv.email);
      qc.invalidateQueries({ queryKey: ['crm_team_invites'] });
      toast.success(
        data.email_sent
          ? 'Invite re-sent — new temporary password emailed'
          : 'New temp password generated — copy it below to share manually',
      );
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not resend invite'),
  });

  if (!isOwnerOrAdmin) return null;

  function copyTo(kind: 'url' | 'pw', value: string) {
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          Invite an agent
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          We'll create their account, email them a temporary password, and ask
          them to set a personal one on first sign-in. They'll only see leads
          you assign to them.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="invite-name" className="text-xs">Full name</Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zara Malik" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="invite-email" className="text-xs">Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="zara@example.com" className="mt-1.5" />
          </div>
        </div>
        <div>
          <Label htmlFor="invite-note" className="text-xs">Personal note (optional)</Label>
          <Textarea id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Excited to have you on the team!" rows={2} className="mt-1.5 resize-none" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => sendMut.mutate()}
            disabled={!name.trim() || !email.trim() || sendMut.isPending}
          >
            {sendMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send invite
          </Button>
        </div>

        {/* Last sent — show temp password ONCE for backup / verbal share */}
        {(lastTempPassword || lastUrl) && (
          <div className="rounded-lg border border-[#D7A542]/30 bg-[#D7A542]/5 p-4 space-y-3">
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#D7A542]">
              Invite sent {lastEmailRecipient ? `· ${lastEmailRecipient}` : ''}
            </div>
            {lastTempPassword && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">Temporary password (shown once — save now if you need a backup)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-sm">
                    {lastTempPassword}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyTo('pw', lastTempPassword)}>
                    {copied === 'pw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            {lastUrl && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">Sign-in link</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-[11px] truncate">
                    {lastUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyTo('url', lastUrl)}>
                    {copied === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              They'll be required to set their own password on first sign-in.
            </p>
          </div>
        )}

        {/* Recent invites */}
        <div className="pt-2 border-t border-border">
          <div className="text-xs font-semibold text-foreground mb-2">Recent invites</div>
          {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && invites.length === 0 && (
            <div className="text-xs text-muted-foreground">No invites yet.</div>
          )}
          <div className="space-y-1.5">
            {invites.slice(0, 8).map((inv) => {
              const meta = STATUS_LABEL[inv.status] ?? STATUS_LABEL.pending;
              return (
                <div key={inv.id} className="flex items-center gap-3 text-xs px-2.5 py-2 rounded-md hover:bg-muted/40 transition-colors">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground truncate">
                      <span className="font-medium">{inv.display_name}</span>
                      <span className="text-muted-foreground"> · {inv.email}</span>
                    </div>
                    <div className="text-[10.5px] text-muted-foreground mt-0.5">
                      <span className={meta.tone}>{meta.text}</span>
                      <span> · sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}</span>
                      {inv.status === 'pending' && (
                        <span> · expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {(inv.status === 'pending' || inv.status === 'expired') && (
                    <button
                      onClick={() => resendMut.mutate(inv)}
                      disabled={resendMut.isPending}
                      className="p-1 text-muted-foreground hover:text-[#D7A542] transition-colors disabled:opacity-50"
                      title="Resend invite with a new temporary password"
                    >
                      {resendMut.isPending && resendMut.variables?.id === inv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCw className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => revokeMut.mutate(inv.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Revoke invite"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
