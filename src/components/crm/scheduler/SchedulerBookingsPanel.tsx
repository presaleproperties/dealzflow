import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSchedulerBookings } from '@/hooks/useScheduler';
import { format } from 'date-fns';
import { Phone, Mail, MapPin, Video, Calendar, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LOC_ICON: Record<string, any> = {
  phone: Phone, video: Video, in_person: MapPin, custom: Calendar,
};

export function SchedulerBookingsPanel() {
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const { data: bookings = [], isLoading, refetch } = useSchedulerBookings(tab);

  const cancel = async (id: string) => {
    if (!confirm('Cancel this booking? The invitee will be notified.')) return;
    const { error } = await supabase.functions.invoke('scheduler-cancel', {
      body: { booking_id: id, by: 'agent', reason: 'Cancelled by agent' },
    });
    if (error) { toast.error('Failed to cancel'); return; }
    toast.success('Booking cancelled');
    refetch();
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : bookings.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">No {tab} bookings.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => {
            const Icon = LOC_ICON[b.location_type] || Calendar;
            return (
              <Card key={b.id} className="p-4 flex items-center gap-4 hover:bg-accent/40 transition-colors">
                <div className="text-center w-[60px] shrink-0">
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {format(new Date(b.start_at), 'MMM')}
                  </div>
                  <div className="text-[24px] font-semibold leading-none">
                    {format(new Date(b.start_at), 'd')}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-1">
                    {format(new Date(b.start_at), 'h:mm a')}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate">
                    {b.invitee_first_name} {b.invitee_last_name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Icon className="w-3 h-3" />{b.duration_min}m</span>
                    {b.invitee_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{b.invitee_email}</span>}
                    {b.invitee_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.invitee_phone}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {b.payment_status === 'paid' && <Badge variant="outline" className="text-[10.5px]">Paid</Badge>}
                  {b.status === 'confirmed' && tab === 'upcoming' && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => cancel(b.id)}>
                      <X className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
