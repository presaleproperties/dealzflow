import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Clock, Mail, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function PendingApprovalPage() {
  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  const isSuspended = profile?.workspace_status === 'suspended';

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-10">
      <Card className="max-w-md w-full p-7 sm:p-8 space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            isSuspended ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          }`}>
            {isSuspended ? <ShieldAlert className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              {isSuspended ? 'Account Suspended' : 'Awaiting Approval'}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              {isSuspended ? 'Access has been paused' : "You're on the list"}
            </h1>
          </div>
        </div>

        {isSuspended ? (
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            Your workspace access has been suspended.
            {profile?.denial_reason ? (
              <span className="block mt-2 text-foreground">Reason: {profile.denial_reason}</span>
            ) : null}
            <span className="block mt-2">Please contact the administrator to restore access.</span>
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Thanks for signing up{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.
              An admin has been notified and will review your request shortly.
            </p>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                What happens next
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/90">An admin reviews your request — usually within 1 business day.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/90">
                    You'll get an email at <span className="font-medium text-foreground">{user?.email ?? 'your account email'}</span> the moment you're approved.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/90">After approval, sign back in and a 10-minute setup wizard will get you running.</span>
                </li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Need it sooner? Message your team admin directly to fast-track approval.
            </p>
          </>
        )}

        <div className="pt-1">
          <Button variant="outline" onClick={handleSignOut} disabled={isLoading} className="w-full h-11">
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
