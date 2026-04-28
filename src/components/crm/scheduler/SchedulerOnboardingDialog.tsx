import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUpdateAgentSchedulerProfile, type AgentSchedulerProfile } from '@/hooks/useScheduler';
import { toast } from 'sonner';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function SchedulerOnboardingDialog({ profile }: { profile: AgentSchedulerProfile }) {
  const [open, setOpen] = useState(true);
  const [slug, setSlug] = useState(profile.slug || slugify((profile.email || '').split('@')[0] || ''));
  const updateMut = useUpdateAgentSchedulerProfile();

  const finish = async () => {
    if (!slug) { toast.error('Pick a slug'); return; }
    await updateMut.mutateAsync({ slug });
    toast.success('Welcome — your scheduler is live');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-[500px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Welcome to Scheduler</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-[13px] text-muted-foreground">
            Pick your booking URL. This is what your invitees will use.
          </p>
          <div>
            <Label className="text-[12px]">Your URL</Label>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">{window.location.origin}/book/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                autoFocus className="flex-1"
              />
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-2">
              We'll create 5 starter event types and a 9-5 weekday schedule. You can edit everything later.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={finish} disabled={!slug || updateMut.isPending}>
            {updateMut.isPending ? 'Setting up…' : 'Get started'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
