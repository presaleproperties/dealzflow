import { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSchedulerBookings, useSchedulerEventTypes } from '@/hooks/useScheduler';
import { useGoogleCalendarEvents, useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarEvents';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { CalendarOff } from 'lucide-react';

const GOLD = 'hsl(var(--primary))';
const GCAL = 'hsl(214 89% 52%)';

export function SchedulerCalendarPanel() {
  const [range, setRange] = useState({
    start: startOfMonth(new Date()).toISOString(),
    end: endOfMonth(new Date()).toISOString(),
  });
  const { data: upcoming = [] } = useSchedulerBookings('upcoming');
  const { data: past = [] } = useSchedulerBookings('past');
  const { data: eventTypes = [] } = useSchedulerEventTypes();
  const { data: gcal } = useGoogleCalendarEvents(range.start, range.end);
  const { data: gcalConn } = useGoogleCalendarConnection();

  const colorByEventType = useMemo(() => {
    const map = new Map<string, string>();
    eventTypes.forEach(et => map.set(et.id, et.color || GOLD));
    return map;
  }, [eventTypes]);

  const events = useMemo(() => {
    const bookings = [...upcoming, ...past].map(b => ({
      id: `b-${b.id}`,
      title: `${b.invitee_first_name} ${b.invitee_last_name}`.trim() || 'Booking',
      start: b.start_at,
      end: b.end_at,
      backgroundColor: colorByEventType.get(b.event_type_id) || GOLD,
      borderColor: colorByEventType.get(b.event_type_id) || GOLD,
      extendedProps: { kind: 'booking', booking: b },
    }));
    const gevents = (gcal?.events || []).map(e => ({
      id: `g-${e.id}`,
      title: `📅 ${e.title}`,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      backgroundColor: GCAL,
      borderColor: GCAL,
      extendedProps: { kind: 'gcal' },
    }));
    return [...bookings, ...gevents];
  }, [upcoming, past, gcal, colorByEventType]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted-foreground">
          All scheduler bookings + your Google Calendar busy times in one view.
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GOLD }} /> Bookings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GCAL }} /> Google
          </span>
          {gcalConn && !gcalConn.connected && (
            <Badge variant="outline" className="text-[10.5px]">
              <CalendarOff className="w-3 h-3 mr-1" /> Google not connected
            </Badge>
          )}
        </div>
      </div>

      <Card className="p-2 sm:p-4">
        <div className="scheduler-calendar">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listWeek',
            }}
            height={680}
            events={events}
            eventDisplay="block"
            datesSet={(arg) => {
              setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
            }}
            eventClick={(arg) => {
              const ext: any = arg.event.extendedProps;
              if (ext.kind === 'booking') {
                const b = ext.booking;
                alert(
                  `${b.invitee_first_name} ${b.invitee_last_name}\n` +
                  `${format(new Date(b.start_at), 'EEE, MMM d · h:mm a')}\n` +
                  `${b.invitee_email || b.invitee_phone || ''}\n` +
                  (b.notes_for_agent ? `\nNotes: ${b.notes_for_agent}` : ''),
                );
              }
            }}
          />
        </div>
      </Card>

      <style>{`
        .scheduler-calendar .fc-toolbar-title { font-size: 16px; font-weight: 600; }
        .scheduler-calendar .fc-button { font-size: 12px; padding: 4px 10px; }
        .scheduler-calendar .fc-event { font-size: 11.5px; padding: 1px 4px; cursor: pointer; }
      `}</style>
    </div>
  );
}
