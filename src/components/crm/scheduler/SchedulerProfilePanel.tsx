import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAgentSchedulerProfile, useUpdateAgentSchedulerProfile } from '@/hooks/useScheduler';
import { usePresaleAgent, usePresaleAgentStore } from '@/stores/usePresaleAgent';
import { toast } from 'sonner';
import { Sparkles, Check, Loader2 } from 'lucide-react';

const TIMEZONES = [
  'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
  'America/Toronto', 'America/Halifax', 'America/St_Johns',
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function SchedulerProfilePanel() {
  const { data: profile, isLoading } = useAgentSchedulerProfile();
  const updateMut = useUpdateAgentSchedulerProfile();
  const { agent: presaleAgent, status: presaleStatus, refresh: refreshPresale } = usePresaleAgent();
  const [form, setForm] = useState<any>({});

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  if (isLoading || !profile) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const u = (patch: any) => setForm({ ...form, ...patch });

  const importFromPresale = async () => {
    if (presaleStatus !== 'ready' || !presaleAgent) {
      await refreshPresale({ force: true });
    }
    const a = usePresaleAgentStore.getState().agent;
    if (!a) {
      toast.error('No matching Presale agent found for your email');
      return;
    }
    const patch: any = {};
    if (a.headshotUrl) patch.headshot_url = a.headshotUrl;
    if (a.brokerage) patch.brokerage = a.brokerage;
    if (a.licenseNumber) patch.license_no = a.licenseNumber;
    setForm({ ...form, ...patch });
    toast.success('Imported from Presale Properties — review then click Save');
  };

  const save = async () => {
    const patch = {
      slug: slugify(form.slug || ''),
      headshot_url: form.headshot_url || null,
      brokerage: form.brokerage || null,
      license_no: form.license_no || null,
      timezone: form.timezone || 'America/Vancouver',
      bio: form.bio || null,
      default_buffer_min: parseInt(form.default_buffer_min) || 0,
      default_min_notice_min: parseInt(form.default_min_notice_min) || 240,
    };
    if (!patch.slug) { toast.error('URL slug is required'); return; }
    await updateMut.mutateAsync(patch);
    toast.success('Profile saved');
  };

  const publicHost = window.location.origin.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-4 max-w-[680px]">
      {/* Presale import banner */}
      <Card className="p-4 flex items-start gap-3 bg-[hsl(var(--accent))]/40 border-[hsl(var(--accent))]">
        <Sparkles className="w-4 h-4 text-[#D7A542] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-foreground">
            Import from Presale Properties
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Pull your headshot, brokerage, and license # from your Presale agent profile.
            {presaleStatus === 'ready' && presaleAgent && (
              <> Matched: <span className="text-foreground font-medium">{presaleAgent.name || presaleAgent.email}</span></>
            )}
            {presaleStatus === 'unmatched' && <> No matching Presale agent found for your email.</>}
          </p>
        </div>
        <Button
          size="sm" variant="outline"
          onClick={importFromPresale}
          disabled={presaleStatus === 'loading' || presaleStatus === 'unmatched'}
        >
          {presaleStatus === 'loading' ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Loading</>
          ) : presaleStatus === 'ready' ? (
            <><Check className="w-3 h-3 mr-1.5" /> Import</>
          ) : 'Import'}
        </Button>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <Label className="text-[12px]">Public booking URL</Label>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[12.5px] text-muted-foreground whitespace-nowrap">{publicHost}/r/</span>
            <Input
              value={form.slug || ''}
              onChange={(e) => u({ slug: slugify(e.target.value) })}
              placeholder="your-name"
              className="flex-1 min-w-[180px]"
            />
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1.5">
            Short, neutral URL — no DealzFlow branding shown to invitees.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Brokerage</Label>
            <Input value={form.brokerage || ''} onChange={(e) => u({ brokerage: e.target.value })} placeholder="Real Broker BC" />
          </div>
          <div>
            <Label className="text-[12px]">License #</Label>
            <Input value={form.license_no || ''} onChange={(e) => u({ license_no: e.target.value })} />
          </div>
        </div>

        <div>
          <Label className="text-[12px]">Headshot URL</Label>
          <div className="flex items-center gap-3 mt-1">
            {form.headshot_url && (
              <img src={form.headshot_url} alt="Headshot preview"
                className="w-12 h-12 rounded-full object-cover border border-border shrink-0" />
            )}
            <Input value={form.headshot_url || ''} onChange={(e) => u({ headshot_url: e.target.value })} placeholder="https://…" />
          </div>
        </div>

        <div>
          <Label className="text-[12px]">Bio (shown on booking page)</Label>
          <Textarea rows={3} value={form.bio || ''} onChange={(e) => u({ bio: e.target.value })}
            placeholder="A short intro shown beneath your name on the public booking page." />
        </div>

        <div>
          <Label className="text-[12px]">Timezone</Label>
          <select
            value={form.timezone || 'America/Vancouver'}
            onChange={(e) => u({ timezone: e.target.value })}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-[13px]"
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Default buffer (min)</Label>
            <Input type="number" min={0} value={form.default_buffer_min ?? 0} onChange={(e) => u({ default_buffer_min: e.target.value })} />
          </div>
          <div>
            <Label className="text-[12px]">Default min notice (min)</Label>
            <Input type="number" min={0} value={form.default_min_notice_min ?? 240} onChange={(e) => u({ default_min_notice_min: e.target.value })} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={updateMut.isPending}>
          {updateMut.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </div>
  );
}

// helper — read store snapshot synchronously for the import handler
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';
function usePresaleAgentStoreRead() {
  return usePresaleAgentStore.getState().agent;
}
