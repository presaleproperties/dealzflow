import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAgentSchedulerProfile, useUpdateAgentSchedulerProfile } from '@/hooks/useScheduler';
import { toast } from 'sonner';

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
  const [form, setForm] = useState<any>({});

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  if (isLoading || !profile) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const u = (patch: any) => setForm({ ...form, ...patch });

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

  return (
    <div className="space-y-4 max-w-[640px]">
      <Card className="p-5 space-y-4">
        <div>
          <Label className="text-[12px]">URL slug</Label>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">{window.location.origin}/book/</span>
            <Input
              value={form.slug || ''}
              onChange={(e) => u({ slug: slugify(e.target.value) })}
              placeholder="your-name"
              className="flex-1"
            />
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            Lowercase letters, numbers, and dashes only.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <Input value={form.headshot_url || ''} onChange={(e) => u({ headshot_url: e.target.value })} placeholder="https://…" />
        </div>

        <div>
          <Label className="text-[12px]">Bio (shown on booking page)</Label>
          <Textarea rows={3} value={form.bio || ''} onChange={(e) => u({ bio: e.target.value })} />
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

        <div className="grid grid-cols-2 gap-3">
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
