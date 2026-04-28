import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SchedulerEventTypesPanel } from '@/components/crm/scheduler/SchedulerEventTypesPanel';
import { SchedulerAvailabilityPanel } from '@/components/crm/scheduler/SchedulerAvailabilityPanel';
import { SchedulerBookingsPanel } from '@/components/crm/scheduler/SchedulerBookingsPanel';
import { SchedulerProfilePanel } from '@/components/crm/scheduler/SchedulerProfilePanel';
import { SchedulerPreviewPanel } from '@/components/crm/scheduler/SchedulerPreviewPanel';
import { SchedulerCalendarPanel } from '@/components/crm/scheduler/SchedulerCalendarPanel';
import { SchedulerTeamPrefillCard } from '@/components/crm/scheduler/SchedulerTeamPrefillCard';
import { SchedulerOnboardingDialog } from '@/components/crm/scheduler/SchedulerOnboardingDialog';
import { useAgentSchedulerProfile, useSchedulerEventTypes, useAvailability, useSchedulerBookings } from '@/hooks/useScheduler';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Copy, ExternalLink, Calendar as CalendarIcon, Settings as SettingsIcon, ListChecks, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const SETUP_SECTIONS = [
  { id: 'profile', label: 'Profile', hint: 'Your identity on the booking page' },
  { id: 'availability', label: 'Availability', hint: 'When invitees can book you' },
  { id: 'event-types', label: 'Event Types', hint: 'Meeting templates you offer' },
  { id: 'team', label: 'Team', hint: 'Sync from Presale (admin)' },
] as const;
type SetupSection = typeof SETUP_SECTIONS[number]['id'];

function HeroIdentity({ profile, onCopy, publicUrl }: { profile: any; onCopy: () => void; publicUrl: string | null }) {
  const initials = (profile?.display_name || 'A')
    .split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase();
  const focalY = profile?.headshot_focal_y ?? 30;

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-br from-card via-card to-[hsl(var(--accent))]/30">
      {/* Editorial gold accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D7A542] to-transparent opacity-60" />
      <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {profile?.headshot_url ? (
          <img src={profile.headshot_url} alt={profile.display_name}
            className="w-[72px] h-[72px] rounded-full object-cover border border-border shadow-sm shrink-0"
            style={{ objectPosition: `center ${focalY}%` }} />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-xl font-medium border border-border shrink-0"
            style={{ background: '#D7A542', color: 'white', fontFamily: 'Georgia, serif' }}>
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
            {profile?.display_name || 'Your scheduler'}
          </h1>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-1 text-[13px] text-muted-foreground">
            {profile?.title && <span className="text-foreground/80">{profile.title}</span>}
            {profile?.title && profile?.brokerage && <span className="text-muted-foreground/50">·</span>}
            {profile?.brokerage && <span>{profile.brokerage}</span>}
            {!profile?.title && !profile?.brokerage && (
              <span className="italic">Add your title and brokerage in Profile →</span>
            )}
          </div>
        </div>
        {publicUrl && (
          <div className="flex items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center w-full sm:w-auto">
            <code className="hidden lg:inline-block text-[11.5px] px-2.5 py-1.5 rounded-md bg-background/60 border border-border text-foreground/70 max-w-[260px] truncate">
              {publicUrl.replace(/^https?:\/\//, '')}
            </code>
            <Button variant="outline" size="sm" onClick={onCopy} className="flex-1 sm:flex-none">
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
            </Button>
            <Button variant="default" size="sm" onClick={() => window.open(publicUrl, '_blank')}
              className="bg-[#D7A542] hover:bg-[#c69833] text-white border-0">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Preview live
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function CompletenessChecklist({ profile, eventTypes, availability }: { profile: any; eventTypes: any[]; availability: any[] }) {
  const items = useMemo(() => [
    { id: 'profile-name', label: 'Name & email', done: !!profile?.display_name && !!profile?.email },
    { id: 'profile-photo', label: 'Headshot', done: !!profile?.headshot_url },
    { id: 'profile-title', label: 'Title & brokerage', done: !!profile?.title || !!profile?.brokerage },
    { id: 'profile-slug', label: 'Public URL slug', done: !!profile?.slug },
    { id: 'availability', label: 'Weekly availability', done: availability.length > 0 },
    { id: 'event-types', label: 'At least 1 active event', done: eventTypes.some((e) => e.is_active) },
  ], [profile, eventTypes, availability]);

  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);

  if (pct === 100) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13.5px] font-semibold text-foreground">Setup completeness</h3>
        <span className="text-[12px] text-muted-foreground tabular-nums">{done}/{items.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div className="h-full bg-[#D7A542] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {items.map((i) => (
          <div key={i.id} className={`flex items-center gap-2 text-[12px] ${i.done ? 'text-muted-foreground' : 'text-foreground'}`}>
            <div className={`w-3 h-3 rounded-full border ${i.done ? 'bg-emerald-500 border-emerald-500' : 'border-border bg-background'}`}>
              {i.done && (
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-white"><path d="M3 6.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </div>
            <span className={i.done ? 'line-through' : ''}>{i.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function CrmSchedulerPage() {
  const [params, setParams] = useSearchParams();
  // Legacy tab params map into new structure
  const rawTab = params.get('tab') || 'setup';
  const tab = ['setup', 'calendar', 'bookings'].includes(rawTab)
    ? rawTab
    : (rawTab === 'calendar' ? 'calendar' : rawTab === 'bookings' ? 'bookings' : 'setup');

  // Legacy section deep-links
  const legacySection = params.get('section') as SetupSection | null;
  const initialSection: SetupSection =
    legacySection && SETUP_SECTIONS.find((s) => s.id === legacySection)
      ? legacySection
      : (['profile', 'availability', 'event-types', 'team'].includes(rawTab) ? rawTab as SetupSection : 'profile');

  const [setupSection, setSetupSection] = useState<SetupSection>(initialSection);
  const [showPreview, setShowPreview] = useState<boolean>(() => {
    const saved = localStorage.getItem('scheduler_preview_open');
    return saved === null ? true : saved === '1';
  });

  useEffect(() => {
    localStorage.setItem('scheduler_preview_open', showPreview ? '1' : '0');
  }, [showPreview]);

  const { data: profile, isLoading } = useAgentSchedulerProfile();
  const { data: eventTypes = [] } = useSchedulerEventTypes();
  const { data: availability = [] } = useAvailability();
  const { data: upcoming = [] } = useSchedulerBookings('upcoming');

  const needsOnboarding = !isLoading && profile && !profile.scheduler_onboarded_at;

  const publicUrl = profile?.slug ? `${window.location.origin}/r/${profile.slug}` : null;

  const handleCopy = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success('Link copied');
  };

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    next.delete('section');
    setParams(next);
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-[120px] w-full mb-5" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
      {/* Premium hero */}
      <div className="mb-5">
        <HeroIdentity profile={profile} onCopy={handleCopy} publicUrl={publicUrl} />
      </div>

      {/* At-a-glance stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Active events</div>
          <div className="text-[22px] font-semibold tabular-nums mt-0.5 text-foreground">
            {eventTypes.filter((e) => e.is_active).length}
            <span className="text-[12px] text-muted-foreground/60 font-normal ml-1">/ {eventTypes.length}</span>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Available days/wk</div>
          <div className="text-[22px] font-semibold tabular-nums mt-0.5 text-foreground">
            {new Set(availability.filter((a) => a.is_active).map((a) => a.day_of_week)).size}
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Upcoming bookings</div>
          <div className="text-[22px] font-semibold tabular-nums mt-0.5 text-foreground">{upcoming.length}</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <TabsList className="h-auto p-0.5">
            <TabsTrigger value="setup" className="gap-1.5 data-[state=active]:shadow-sm">
              <SettingsIcon className="w-3.5 h-3.5" /> Setup
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="bookings" className="gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Bookings
            </TabsTrigger>
          </TabsList>

          {tab === 'setup' && publicUrl && (
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowPreview((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showPreview ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide preview</> : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Show preview</>}
            </Button>
          )}
        </div>

        {/* SETUP — premium guided flow */}
        <TabsContent value="setup" className="mt-0">
          <div className={`grid gap-5 ${showPreview && publicUrl ? 'grid-cols-1 xl:grid-cols-[260px_1fr_minmax(360px,420px)]' : 'grid-cols-1 lg:grid-cols-[240px_1fr]'}`}>
            {/* Left rail — section nav */}
            <aside className="space-y-1.5">
              <CompletenessChecklist profile={profile} eventTypes={eventTypes} availability={availability} />
              <Card className="p-1.5 mt-3">
                {SETUP_SECTIONS.map((s) => {
                  const active = setupSection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSetupSection(s.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                        active
                          ? 'bg-[hsl(var(--accent))]/60 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <div className="text-[13px] font-medium">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{s.hint}</div>
                    </button>
                  );
                })}
              </Card>
            </aside>

            {/* Center — active section */}
            <div className="min-w-0">
              {setupSection === 'profile' && <SchedulerProfilePanel />}
              {setupSection === 'availability' && <SchedulerAvailabilityPanel />}
              {setupSection === 'event-types' && <SchedulerEventTypesPanel agentSlug={profile?.slug || null} />}
              {setupSection === 'team' && <SchedulerTeamPrefillCard />}
            </div>

            {/* Right — sticky live preview (xl+) */}
            {showPreview && publicUrl && (
              <aside className="hidden xl:block">
                <div className="sticky top-4">
                  <SchedulerPreviewPanel compact />
                </div>
              </aside>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <SchedulerCalendarPanel />
        </TabsContent>

        <TabsContent value="bookings" className="mt-0">
          <SchedulerBookingsPanel />
        </TabsContent>
      </Tabs>

      {needsOnboarding && <SchedulerOnboardingDialog profile={profile} />}
    </div>
  );
}
