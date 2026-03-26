import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, MapPin, ExternalLink } from 'lucide-react';
import { format, isToday, parseISO, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location?: string | null;
  calendarColor?: string | null;
  calendarName?: string | null;
  htmlLink?: string | null;
}

function useCalendarEventsToday() {
  const { user } = useAuth();
  const today = new Date();
  const timeMin = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const timeMax = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  return useQuery({
    queryKey: ['dashboard-agenda', user?.id, format(today, 'yyyy-MM-dd')],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://${projectId}.supabase.co/functions/v1/google-calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=20`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.events || []) as CalendarEvent[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function TodayAgenda() {
  const { data: events = [], isLoading } = useCalendarEventsToday();
  const now = new Date();

  const upcomingEvents = useMemo(() => {
    return events
      .filter(e => {
        if (e.allDay) return true;
        if (!e.end) return true;
        return !isBefore(parseISO(e.end), now);
      })
      .slice(0, 5);
  }, [events, now]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Today's Agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          Today's Agenda
          {events.length > 0 && (
            <span className="ml-auto text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-2xl bg-primary/8 flex items-center justify-center mb-2.5">
              <Calendar className="w-5 h-5 text-primary/40" />
            </div>
            <p className="text-[13px] font-medium text-foreground">No events today</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Enjoy your free day!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const startTime = event.start && !event.allDay ? format(parseISO(event.start), 'h:mm a') : null;
              const endTime = event.end && !event.allDay ? format(parseISO(event.end), 'h:mm a') : null;
              const isPast = event.end && !event.allDay && isBefore(parseISO(event.end), now);

              return (
                <a
                  key={event.id}
                  href={event.htmlLink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group flex items-start gap-3 p-3 rounded-xl border border-border/40 transition-all duration-200",
                    "hover:bg-muted/40 hover:border-border/60",
                    isPast && "opacity-50"
                  )}
                >
                  {/* Color dot */}
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                    style={{ backgroundColor: event.calendarColor || 'hsl(var(--primary))' }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate leading-snug">
                      {event.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {event.allDay ? (
                        <span className="text-[11px] text-muted-foreground font-medium">All day</span>
                      ) : startTime ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {startTime}{endTime ? ` – ${endTime}` : ''}
                        </span>
                      ) : null}
                      {event.location && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </span>
                      )}
                    </div>
                    {event.calendarName && event.calendarName !== 'Primary' && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{event.calendarName}</p>
                    )}
                  </div>

                  <ExternalLink className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
