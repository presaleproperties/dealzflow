import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Forced password change screen. Shown to invited team members who
 * signed in with the temporary password emailed to them.
 *
 * Once they pick a new password we clear `profiles.must_change_password`
 * via the SECURITY DEFINER `mark_password_changed` RPC, so even if their
 * profile row is somehow modified concurrently, only their own flag clears.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // If the flag is already cleared, don't trap them here.
  if (profile && !profile.must_change_password) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (pw1 !== pw2) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pw1 });
      if (updErr) throw updErr;

      const { error: rpcErr } = await supabase.rpc('mark_password_changed');
      if (rpcErr) throw rpcErr;

      await qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Password updated', {
        description: 'Welcome to Dealz Flow.',
      });
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#D7A542]">
            <ShieldCheck className="w-3.5 h-3.5" />
            One-time setup
          </div>
          <CardTitle className="text-2xl mt-2">Set your password</CardTitle>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            You signed in with a temporary password. Choose a personal password
            to finish setting up your account.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="pw1" className="text-xs">New password</Label>
              <Input
                id="pw1"
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                minLength={8}
                required
                className="mt-1.5"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">At least 8 characters.</p>
            </div>
            <div>
              <Label htmlFor="pw2" className="text-xs">Confirm new password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                minLength={8}
                required
                className="mt-1.5"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
              {submitting ? 'Saving…' : 'Save password & continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
