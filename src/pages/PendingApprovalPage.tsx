import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';

export default function PendingApprovalPage() {
  const { data: profile, isLoading } = useProfile();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  const isSuspended = profile?.workspace_status === 'suspended';

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full p-8 space-y-5 text-center">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {isSuspended ? 'Account Suspended' : 'Awaiting Approval'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isSuspended ? 'Access has been paused' : "You're on the list"}
          </h1>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {isSuspended ? (
            <>
              Your workspace access has been suspended.
              {profile?.denial_reason ? (
                <span className="block mt-2 text-foreground">Reason: {profile.denial_reason}</span>
              ) : null}
              <span className="block mt-2">Please contact the administrator to restore access.</span>
            </>
          ) : (
            <>
              Thanks for signing up{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.
              An administrator has been notified and will review your request shortly. You'll receive
              an email once your access is approved.
            </>
          )}
        </p>

        <div className="pt-2">
          <Button variant="outline" onClick={handleSignOut} disabled={isLoading} className="w-full">
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
