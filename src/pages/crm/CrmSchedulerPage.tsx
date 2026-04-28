import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SchedulerEventTypesPanel } from '@/components/crm/scheduler/SchedulerEventTypesPanel';
import { SchedulerAvailabilityPanel } from '@/components/crm/scheduler/SchedulerAvailabilityPanel';
import { SchedulerBookingsPanel } from '@/components/crm/scheduler/SchedulerBookingsPanel';
import { SchedulerProfilePanel } from '@/components/crm/scheduler/SchedulerProfilePanel';
import { SchedulerPreviewPanel } from '@/components/crm/scheduler/SchedulerPreviewPanel';
import { SchedulerCalendarPanel } from '@/components/crm/scheduler/SchedulerCalendarPanel';
import { SchedulerOnboardingDialog } from '@/components/crm/scheduler/SchedulerOnboardingDialog';
import { useAgentSchedulerProfile } from '@/hooks/useScheduler';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CrmSchedulerPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'event-types';
  const { data: profile, isLoading } = useAgentSchedulerProfile();
  const navigate = useNavigate();

  const needsOnboarding = !isLoading && profile && !profile.scheduler_onboarded_at;

  const publicUrl = profile?.slug
    ? `${window.location.origin}/r/${profile.slug}`
    : null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            Scheduler
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1">
            Your native booking system. Replace Calendly entirely.
          </p>
        </div>
        {publicUrl && (
          <div className="flex items-center gap-2">
            <code className="text-[12px] px-2.5 py-1.5 rounded-md bg-muted/60 border border-border text-foreground/80">
              {publicUrl.replace(/^https?:\/\//, '')}
            </code>
            <Button
              variant="outline" size="sm"
              onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copied'); }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => window.open(publicUrl, '_blank')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
          <TabsList className="mb-5 flex-wrap h-auto">
            <TabsTrigger value="event-types">Event Types</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
          <TabsContent value="event-types"><SchedulerEventTypesPanel agentSlug={profile?.slug || null} /></TabsContent>
          <TabsContent value="availability"><SchedulerAvailabilityPanel /></TabsContent>
          <TabsContent value="calendar"><SchedulerCalendarPanel /></TabsContent>
          <TabsContent value="bookings"><SchedulerBookingsPanel /></TabsContent>
          <TabsContent value="preview"><SchedulerPreviewPanel /></TabsContent>
          <TabsContent value="profile"><SchedulerProfilePanel /></TabsContent>
        </Tabs>
      )}

      {needsOnboarding && <SchedulerOnboardingDialog profile={profile} />}
    </div>
  );
}
