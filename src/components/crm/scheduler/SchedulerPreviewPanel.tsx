import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Tablet, Monitor, RefreshCw, ExternalLink } from 'lucide-react';
import {
  useAgentSchedulerProfile,
  useSchedulerEventTypes,
  useAvailability,
} from '@/hooks/useScheduler';

type Device = 'mobile' | 'tablet' | 'desktop';

const SIZES: Record<Device, { w: number; label: string }> = {
  mobile: { w: 390, label: 'iPhone' },
  tablet: { w: 768, label: 'Tablet' },
  desktop: { w: 1100, label: 'Desktop' },
};

export function SchedulerPreviewPanel({ compact = false }: { compact?: boolean } = {}) {
  const { data: profile, isLoading } = useAgentSchedulerProfile();
  const { data: eventTypes = [], dataUpdatedAt: etUpdatedAt } = useSchedulerEventTypes();
  const { dataUpdatedAt: availUpdatedAt } = useAvailability();

  const [device, setDevice] = useState<Device>('mobile');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | 'landing'>('landing');

  // Auto-refresh the iframe when availability or event types change.
  // `dataUpdatedAt` ticks every time the cache resolves a fresh value
  // (mutation invalidations included), so the preview always mirrors current settings.
  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [etUpdatedAt, availUpdatedAt, profile?.slug]);

  const previewUrl = useMemo(() => {
    if (!profile?.slug) return null;
    const base = `${window.location.origin}/r/${profile.slug}`;
    return selectedEventSlug === 'landing' ? base : `${base}/${selectedEventSlug}`;
  }, [profile?.slug, selectedEventSlug]);

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!previewUrl) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[13px] text-muted-foreground">Set your URL slug in the Profile tab to enable preview.</p>
      </Card>
    );
  }

  const w = SIZES[device].w;
  const activeEventTypes = eventTypes.filter((et) => et.is_active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          Live preview — auto-refreshes when you change availability or event types.
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
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(previewUrl, '_blank')}>
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Event-type chip switcher */}
      {activeEventTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedEventSlug('landing')}
            className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-colors ${
              selectedEventSlug === 'landing'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            Landing
          </button>
          {activeEventTypes.map((et) => (
            <button
              key={et.id}
              onClick={() => setSelectedEventSlug(et.slug)}
              className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${
                selectedEventSlug === et.slug
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: et.color || '#D7A542' }} />
              {et.title}
            </button>
          ))}
        </div>
      )}

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
