import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import logoMark from '@/assets/logo-mark.png';

type Status = 'validating' | 'invalid' | 'ready' | 'submitting' | 'success';

interface InviteInfo {
  valid: boolean;
  reason?: string;
  email?: string;
  display_name?: string;
  expires_at?: string;
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<Status>('validating');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validate() {
      if (!token) {
        setStatus('invalid');
        setError('No invite token in the URL.');
        return;
      }
      const { data, error: rpcErr } = await supabase.rpc('crm_team_validate_invite', { _token: token });
      if (rpcErr) {
        setStatus('invalid');
        setError('Could not validate this invite. Please try again later.');
        return;
      }
      const result = data as unknown as InviteInfo;
      if (!result?.valid) {
        setStatus('invalid');
        const reasonCopy: Record<string, string> = {
          expired: 'This invite has expired. Ask your admin to send a new one.',
          accepted: 'This invite has already been used.',
          revoked: 'This invite was revoked. Ask your admin to send a new one.',
          not_found: 'We could not find this invite.',
          invalid_token: 'This invite link is invalid.',
        };
        setError(reasonCopy[result?.reason ?? ''] ?? 'This invite is no longer valid.');
        return;
      }
      setInvite(result);
      setStatus('ready');
    }
    validate();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setStatus('submitting');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('crm-accept-invite', {
        body: { token, password },
      });
      if (fnErr) throw fnErr;
      if (!data?.success || !data?.access_token) {
        throw new Error(data?.error ?? 'Could not accept invite');
      }
      // Establish the session client-side
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) throw setErr;
      setStatus('success');
      // Wizard auto-opens once profile loads (workspace is approved by redeem)
      setTimeout(() => navigate('/crm/leads', { replace: true }), 900);
    } catch (e: any) {
      setStatus('ready');
      setError(e?.message ?? 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <img src={logoMark} alt="" className="w-8 h-8" />
          <span className="text-[15px] font-semibold tracking-tight">Dealz Flow</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          {status === 'validating' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Checking your invite…</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Invite unavailable</h1>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
              <Link to="/auth" className="block">
                <Button variant="outline" className="w-full">Go to sign in</Button>
              </Link>
            </div>
          )}

          {(status === 'ready' || status === 'submitting') && invite && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary mb-1.5">
                  Welcome
                </div>
                <h1 className="text-xl font-bold text-foreground">
                  Hi {invite.display_name?.split(' ')[0] ?? 'there'}, set your password
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  You're joining as <span className="text-foreground font-medium">{invite.email}</span>.
                  Choose a password to finish creating your account.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="pw" className="text-xs font-medium">New password</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="pw"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      autoFocus
                      required
                      minLength={8}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">At least 8 characters.</p>
                </div>

                <div>
                  <Label htmlFor="pw2" className="text-xs font-medium">Confirm password</Label>
                  <Input
                    id="pw2"
                    type={showPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="mt-1.5"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={status === 'submitting'}>
                {status === 'submitting' ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up your account…</>
                ) : (
                  'Set password & continue'
                )}
              </Button>
            </form>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <h1 className="text-lg font-semibold text-foreground">You're in!</h1>
              <p className="text-sm text-muted-foreground">Taking you to your workspace…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
