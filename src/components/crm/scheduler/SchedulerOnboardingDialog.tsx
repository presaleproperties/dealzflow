import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUpdateAgentSchedulerProfile, type AgentSchedulerProfile } from '@/hooks/useScheduler';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Check, Calendar, Link2, Sparkles, Loader2, ExternalLink } from 'lucide-react';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Step = 'slug' | 'templates' | 'gcal' | 'done';

export function SchedulerOnboardingDialog({ profile }: { profile: AgentSchedulerProfile }) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<Step>('slug');
  const [slug, setSlug] = useState(profile.slug || slugify((profile.email || '').split('@')[0] || ''));
  const [savingSlug, setSavingSlug] = useState(false);
  const [savingDone, setSavingDone] = useState(false);
  const updateMut = useUpdateAgentSchedulerProfile();

  // Poll google calendar connection status
  const gcal = useQuery({
    queryKey: ['scheduler-onboarding-gcal'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', { body: { action: 'status' } });
      if (error) {
        const msg = String(error?.message || '').toLowerCase();
        if (msg.includes('unauthorized')) return { connected: false, calendarEmail: null };
        throw error;
      }
      return data as { connected: boolean; calendarEmail: string | null };
    },
    enabled: open && step === 'gcal',
    refetchInterval: step === 'gcal' ? 4000 : false,
    staleTime: 0,
  });

  const saveSlug = async () => {
    if (!slug || slug.length < 2) { toast.error('Pick a slug (at least 2 chars)'); return; }
    setSavingSlug(true);
    try {
      await updateMut.mutateAsync({ slug });
      setStep('templates');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save slug');
    } finally { setSavingSlug(false); }
  };

  const connectGcal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'get_auth_url', redirectUrl: window.location.origin + '/crm/scheduler' },
      });
      if (error) throw error;
      if (data?.authUrl) window.open(data.authUrl, '_blank', 'width=500,height=700');
    } catch (e: any) {
      toast.error(e?.message || 'Could not start Google connection');
    }
  };

  const finish = async () => {
    setSavingDone(true);
    try {
      await updateMut.mutateAsync({ scheduler_onboarded_at: new Date().toISOString() } as any);
      toast.success('Welcome — your scheduler is live');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not finish setup');
    } finally { setSavingDone(false); }
  };

  // Once gcal connects, auto-advance optional but keep on screen so user can confirm
  useEffect(() => {
    if (step === 'gcal' && gcal.data?.connected) {
      // no-op; user clicks finish
    }
  }, [gcal.data, step]);

  const StepDot = ({ active, done, label, idx }: { active: boolean; done: boolean; label: string; idx: number }) => (
    <div className="flex items-center gap-2 flex-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold ${
        done ? 'bg-primary text-primary-foreground' : active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
      }`}>{done ? <Check className="w-3.5 h-3.5" /> : idx}</div>
      <span className={`text-[12px] ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-[540px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Set up your Scheduler
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 py-3 border-y border-border">
          <StepDot idx={1} label="URL" active={step === 'slug'} done={step !== 'slug'} />
          <div className="h-px flex-1 bg-border" />
          <StepDot idx={2} label="Templates" active={step === 'templates'} done={step === 'gcal' || step === 'done'} />
          <div className="h-px flex-1 bg-border" />
          <StepDot idx={3} label="Calendar" active={step === 'gcal'} done={step === 'done'} />
        </div>

        <div className="py-4 min-h-[180px]">
          {step === 'slug' && (
            <div className="space-y-4">
              <p className="text-[13px] text-muted-foreground">
                Your booking URL is what invitees will see and use.
              </p>
              <div>
                <Label className="text-[12px]">Your URL</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[12.5px] text-muted-foreground whitespace-nowrap">{window.location.origin.replace(/^https?:\/\//, '')}/r/</span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    autoFocus className="flex-1"
                  />
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-2">
                  Lowercase letters, numbers, and hyphens. You can change this later.
                </p>
              </div>
            </div>
          )}

          {step === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13.5px] font-medium text-foreground">5 starter event types installed</div>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Discovery Call, Buyer Consultation, Listing Consultation, Mortgage Pre-Approval, Property Showing.
                    Plus a default 9–5 weekday availability.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13.5px] font-medium text-foreground">23 project preview templates available</div>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Inactive by default — flip them on per launch from the Event Types tab.
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                You can edit, rename, or delete any of these from the Scheduler dashboard.
              </p>
            </div>
          )}

          {step === 'gcal' && (
            <div className="space-y-4">
              <p className="text-[13px] text-muted-foreground">
                Connect Google Calendar so we can read your busy times and write new bookings to your calendar.
                Optional but strongly recommended.
              </p>
              {gcal.data?.connected ? (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[13.5px] font-medium text-emerald-900">Connected</div>
                    <p className="text-[12px] text-emerald-800 mt-1">{gcal.data.calendarEmail}</p>
                  </div>
                </div>
              ) : (
                <Button onClick={connectGcal} variant="outline" className="w-full">
                  <Link2 className="w-3.5 h-3.5 mr-2" />
                  Connect Google Calendar
                  <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
                </Button>
              )}
              {gcal.isFetching && !gcal.data?.connected && (
                <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Waiting for connection…
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === 'templates' && (
            <Button variant="ghost" onClick={() => setStep('slug')}>Back</Button>
          )}
          {step === 'gcal' && (
            <Button variant="ghost" onClick={() => setStep('templates')}>Back</Button>
          )}

          {step === 'slug' && (
            <Button onClick={saveSlug} disabled={!slug || savingSlug}>
              {savingSlug ? 'Saving…' : 'Continue'}
            </Button>
          )}
          {step === 'templates' && (
            <Button onClick={() => setStep('gcal')}>Continue</Button>
          )}
          {step === 'gcal' && (
            <Button onClick={finish} disabled={savingDone}>
              {savingDone ? 'Finishing…' : (gcal.data?.connected ? 'Finish' : 'Skip & finish')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
