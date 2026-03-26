import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, parseISO,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clock, MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

// ─── Color palette for events ──────────────────────────────────────────────────
const EVENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--destructive))',
  'hsl(270 48% 56%)',
];

function getEventColor(index: number) {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

// ─── Fetch events hook ─────────────────────────────────────────────────────────
function useCalendarEvents(month: Date) {
  const timeMin = startOfMonth(month).toISOString();
  const timeMax = endOfMonth(month).toISOString();

  return useQuery({
    queryKey: ['google-calendar-events', timeMin, timeMax],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/google-calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      
      const response = await fetch(url, {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch events');
      }

      const result = await response.json();
      return (result.events || []) as CalendarEvent[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ─── Day cell ──────────────────────────────────────────────────────────────────
function DayCell({
  day, currentMonth, events, isSelected, onSelect,
}: {
  day: Date;
  currentMonth: Date;
  events: CalendarEvent[];
  isSelected: boolean;
  onSelect: (d: Date) => void;
}) {
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);
  const hasEvents = events.length > 0;

  return (
    <button
      onClick={() => onSelect(day)}
      className={cn(
        'relative flex flex-col items-center justify-start p-1 h-10 w-full rounded-lg transition-all duration-150',
        !inMonth && 'opacity-30',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        !isSelected && inMonth && 'hover:bg-muted/40',
      )}
    >
      <span className={cn(
        'text-[11px] font-medium leading-none',
        today && 'text-primary font-bold',
        !today && inMonth && 'text-foreground',
        !today && !inMonth && 'text-muted-foreground',
      )}>
        {format(day, 'd')}
      </span>
      {hasEvents && (
        <div className="flex items-center gap-0.5 mt-1">
          {events.slice(0, 3).map((_, i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full"
              style={{ background: getEventColor(i) }}
            />
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Event card ────────────────────────────────────────────────────────────────
function EventCard({ event, index }: { event: CalendarEvent; index: number }) {
  const color = getEventColor(index);
  const startTime = event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a');
  const endTime = !event.allDay && event.end ? format(parseISO(event.end), 'h:mm a') : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="group"
    >
      <div
        className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-border/60 transition-all duration-200"
        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug truncate">
            {event.title}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {startTime}{endTime ? ` – ${endTime}` : ''}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate max-w-[140px]">
                <MapPin className="w-3 h-3 shrink-0" />
                {event.location}
              </span>
            )}
          </div>
        </div>
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main widget ───────────────────────────────────────────────────────────────
export function CalendarWidget() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: events = [], isLoading, isError } = useCalendarEvents(currentMonth);

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Events for selected day
  const selectedEvents = useMemo(() => {
    return events.filter(e => {
      const eventDate = parseISO(e.start);
      return isSameDay(eventDate, selectedDate);
    });
  }, [events, selectedDate]);

  // Events by day (for dots)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(e => {
      const key = format(parseISO(e.start), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 shrink-0">
        <button
          onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold text-foreground flex-1 text-center">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <button
          onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
          className="text-[10px] font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-colors ml-1"
        >
          Today
        </button>
      </div>

      {/* ── Calendar grid ───────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1">
              {d}
            </div>
          ))}
        </div>
        {/* Day grid */}
        <div className="grid grid-cols-7 gap-px">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            return (
              <DayCell
                key={key}
                day={day}
                currentMonth={currentMonth}
                events={eventsByDay.get(key) || []}
                isSelected={isSameDay(day, selectedDate)}
                onSelect={setSelectedDate}
              />
            );
          })}
        </div>
      </div>

      {/* ── Selected day events ─────────────────────────────── */}
      <div className="flex-1 border-t border-border/40 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-foreground">
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {[1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-6 text-center"
              >
                <p className="text-xs text-muted-foreground">Could not load events</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Check your Google Calendar API key</p>
              </motion.div>
            ) : selectedEvents.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-6 text-center"
              >
                <p className="text-xs text-muted-foreground">No events scheduled</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Enjoy the free time ✨</p>
              </motion.div>
            ) : (
              <motion.div
                key="events"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {selectedEvents.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
