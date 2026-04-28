import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
    if ((a as any).title) patch.title = (a as any).title;
    setForm({ ...form, ...patch });
    toast.success('Imported from Presale Properties — review then click Save');
  };

  const save = async () => {
    const patch = {
      slug: slugify(form.slug || ''),
      headshot_url: form.headshot_url || null,
      headshot_focal_y: Math.round(Number(form.headshot_focal_y ?? 30)),
      brokerage: form.brokerage || null,
      license_no: form.license_no || null,
      title: form.title || null,
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
  const focalY = Number(form.headshot_focal_y ?? 30);
  const initials = (form.display_name || profile.display_name || 'A')
    .split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5 max-w-[760px]">
      {/* Presale import banner */}
      <Card className="p-4 flex items-start gap-3 bg-primary/5 border-primary/20">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-foreground">
            Import from Presale Properties
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Pull your headshot, brokerage, title, and license # from your Presale agent profile.
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

      {/* Identity card with live headshot crop preview */}
      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5 items-start">
          <div className="flex flex-col items-center gap-2">
            {form.headshot_url ? (
              <img src={form.headshot_url} alt="Headshot"
                className="w-[120px] h-[120px] rounded-full object-cover border border-border shadow-sm ring-1 ring-primary/20"
                style={{ objectPosition: `center ${focalY}%` }} />
            ) : (
              <div className="w-[120px] h-[120px] rounded-full flex items-center justify-center text-3xl font-bold border border-border bg-primary text-primary-foreground tracking-tight">
                {initials}
              </div>
            )}
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">Public preview</span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px]">Headshot URL</Label>
              <Input value={form.headshot_url || ''} onChange={(e) => u({ headshot_url: e.target.value })} placeholder="https://…" className="mt-1" />
            </div>
            {form.headshot_url && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[12px]">Vertical focus</Label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{focalY}%</span>
                </div>
                <Slider
                  value={[focalY]}
                  min={0} max={100} step={5}
                  onValueChange={(v) => u({ headshot_focal_y: v[0] })}
                  className="mt-2"
                />
                <p className="text-[10.5px] text-muted-foreground mt-1.5">
                  Default 30% centers most faces. Drop higher (toward 0%) if face is at the top, higher % if low.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Identity fields */}
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
            <Label className="text-[12px]">Title</Label>
            <Input value={form.title || ''} onChange={(e) => u({ title: e.target.value })} placeholder="Realtor · PREC Licensed Realtor" />
          </div>
          <div>
            <Label className="text-[12px]">Brokerage</Label>
            <Input value={form.brokerage || ''} onChange={(e) => u({ brokerage: e.target.value })} placeholder="Real Broker BC" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">License #</Label>
            <Input value={form.license_no || ''} onChange={(e) => u({ license_no: e.target.value })} />
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
        </div>

        <div>
          <Label className="text-[12px]">Bio (shown on booking page)</Label>
          <Textarea rows={3} value={form.bio || ''} onChange={(e) => u({ bio: e.target.value })}
            placeholder="A short intro shown beneath your name on the public booking page." />
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
