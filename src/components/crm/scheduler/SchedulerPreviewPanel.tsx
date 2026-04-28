import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Tablet, Monitor, RefreshCw, ExternalLink } from 'lucide-react';
import { useAgentSchedulerProfile } from '@/hooks/useScheduler';

type Device = 'mobile' | 'tablet' | 'desktop';

const SIZES: Record<Device, { w: number; label: string }> = {
  mobile: { w: 390, label: 'iPhone' },
  tablet: { w: 768, label: 'Tablet' },
  desktop: { w: 1100, label: 'Desktop' },
};

export function SchedulerPreviewPanel() {
  const { data: profile, isLoading } = useAgentSchedulerProfile();
  const [device, setDevice] = useState<Device>('mobile');
  const [refreshKey, setRefreshKey] = useState(0);

  const previewUrl = useMemo(
    () => profile?.slug ? `${window.location.origin}/r/${profile.slug}` : null,
    [profile?.slug],
  );

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!previewUrl) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[13px] text-muted-foreground">Set your URL slug in the Profile tab to enable preview.</p>
      </Card>
    );
  }

  const w = SIZES[device].w;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          Live preview of <span className="text-foreground font-medium">your public booking page</span>.
          What invitees see, exactly.
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-md p-0.5">
            {(Object.keys(SIZES) as Device[]).map((d) => {
              const Icon = d === 'mobile' ? Smartphone : d === 'tablet' ? Tablet : Monitor;
              return (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${
                    device === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3 h-3" /> {SIZES[d].label}
                </button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(previewUrl, '_blank')}>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="bg-muted/30 rounded-xl p-4 sm:p-6 flex justify-center overflow-x-auto">
        <div
          className="bg-background rounded-xl shadow-lg border border-border overflow-hidden transition-all"
          style={{ width: w, maxWidth: '100%', height: 760 }}
        >
          <iframe
            key={refreshKey}
            src={previewUrl}
            title="Booking page preview"
            className="w-full h-full"
            style={{ border: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
