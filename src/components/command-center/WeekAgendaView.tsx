import { useState, useMemo, useRef } from 'react';
import {
  format,
  parseISO,
  isSameDay,
  isToday,
  differenceInMinutes,
  startOfDay,
  addDays,
  setHours,
  setMinutes,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Pencil, Trash2, ExternalLink, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const EVENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(210 70% 55%)',
  'hsl(150 60% 45%)',
  'hsl(35 90% 55%)',
  'hsl(280 60% 55%)',
  'hsl(0 70% 55%)',
];

function getEventColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

function getDisplayTitle(event: CalendarEvent, isAuthenticated: boolean) {
  if (event.title && event.title !== '(No title)') return event.title;
  return isAuthenticated ? 'Untitled event' : 'Busy';
}

interface TimelineEventProps {
  event: CalendarEvent;
  dayStart: Date;
  canEdit: boolean;
  isAuthenticated: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: { title: string; startTime: string; endTime: string; allDay: boolean; date: string }) => Promise<void>;
  onQuickAdd?: (hour: number) => void;
}

function TimelineEvent({
  event,
  dayStart,
  canEdit,
  isAuthenticated,
  onDelete,
  onEdit,
}: TimelineEventProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const color = getEventColor(event.id);
  const displayTitle = getDisplayTitle(event, isAuthenticated);

  const eventStart = parseISO(event.start);
  const eventEnd = event.end ? parseISO(event.end) : eventStart;

  const minutesFromDayStart = differenceInMinutes(eventStart, setMinutes(setHours(dayStart, START_HOUR), 0));
  const durationMins = Math.max(differenceInMinutes(eventEnd, eventStart), 25);

  const top = Math.max((minutesFromDayStart / 60) * HOUR_HEIGHT, 0);
  const height = Math.max((durationMins / 60) * HOUR_HEIGHT, 22);

  const startEdit = () => {
    setEditTitle(displayTitle);
    setEditStart(format(eventStart, 'HH:mm'));
    setEditEnd(format(eventEnd, 'HH:mm'));
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editTitle.trim() || saving) return;
    setSaving(true);
    try {
      await onEdit(event.id, {
        title: editTitle.trim(),
        startTime: editStart,
        endTime: editEnd,
        allDay: false,
        date: format(dayStart, 'yyyy-MM-dd'),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute left-0 right-1 z-30 p-2.5 rounded-lg border border-primary/40 bg-card shadow-xl space-y-2"
        style={{ top }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-primary">Edit Event</span>
          <button onClick={() => setEditing(false)} className="w-4 h-4 text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full bg-background/80 border border-border/50 rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <div className="flex items-center gap-1.5">
          <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
            className="bg-background/80 border border-border/50 rounded px-1.5 py-0.5 text-[10px] text-foreground" />
          <span className="text-[10px] text-muted-foreground">–</span>
          <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
            className="bg-background/80 border border-border/50 rounded px-1.5 py-0.5 text-[10px] text-foreground" />
        </div>
        <button
          onClick={handleSave}
          disabled={!editTitle.trim() || saving}
          className="w-full py-1 rounded bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'absolute left-0 right-1 z-10 group rounded-lg overflow-hidden cursor-pointer transition-all hover:z-20 hover:shadow-lg',
        canEdit && 'hover:ring-1 hover:ring-primary/30',
      )}
      style={{ top, height: Math.min(height, (END_HOUR - START_HOUR) * HOUR_HEIGHT - top), minHeight: 22 }}
      draggable={canEdit}
      onDragStart={canEdit ? (e: any) => {
        e.dataTransfer.setData('application/calendar-event', JSON.stringify(event));
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
    >
      <div
        className="h-full px-2 py-1 flex flex-col justify-start"
        style={{ background: color, opacity: 0.9 }}
      >
        <p className="text-[10px] font-bold text-white leading-tight truncate">{displayTitle}</p>
        {height > 30 && (
          <p className="text-[9px] text-white/80 leading-tight mt-0.5">
            {format(eventStart, 'h:mm a')} – {format(eventEnd, 'h:mm a')}
          </p>
        )}
        {height > 50 && event.location && (
          <p className="text-[8px] text-white/60 truncate mt-0.5">{event.location}</p>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); startEdit(); }}
            className="w-5 h-5 rounded bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
        )}
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
            className="w-5 h-5 rounded bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-destructive/80"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        )}
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-5 h-5 rounded bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

function AgendaDayColumn({
  day,
  events: dayEvents,
  canManageEvents,
  isAuthenticated,
  onDeleteEvent,
  onEditEvent,
  onDropEvent,
  showNowLine,
  nowTop,
}: {
  day: Date;
  events: CalendarEvent[];
  canManageEvents: boolean;
  isAuthenticated: boolean;
  onDeleteEvent: (id: string) => void;
  onEditEvent: (id: string, updates: { title: string; startTime: string; endTime: string; allDay: boolean; date: string }) => Promise<void>;
  onDropEvent: (eventJson: string, targetDate: Date) => void;
  showNowLine: boolean;
  nowTop: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const today = isToday(day);

  return (
    <div
      className={cn(
        'flex-1 min-w-0 relative border-l border-border/20',
        today && 'bg-primary/[0.02]',
        dragOver && 'bg-primary/10',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const data = e.dataTransfer.getData('application/calendar-event');
        if (data) onDropEvent(data, day);
      }}
    >
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/15"
          style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
        />
      ))}
      {HOURS.map((hour) => (
        <div
          key={`half-${hour}`}
          className="absolute left-0 right-0 border-t border-border/8"
          style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
        />
      ))}
      {dayEvents.map((event) => (
        <TimelineEvent
          key={event.id}
          event={event}
          dayStart={day}
          canEdit={canManageEvents}
          isAuthenticated={isAuthenticated}
          onDelete={onDeleteEvent}
          onEdit={onEditEvent}
        />
      ))}
      {today && showNowLine && (
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-destructive -ml-1 shrink-0" />
            <div className="flex-1 h-[2px] bg-destructive" />
          </div>
        </div>
      )}
    </div>
  );
}

interface WeekAgendaViewProps {
  weekDays: Date[];
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  canManageEvents: boolean;
  isAuthenticated: boolean;
  onDeleteEvent: (id: string) => void;
  onEditEvent: (id: string, updates: { title: string; startTime: string; endTime: string; allDay: boolean; date: string }) => Promise<void>;
  onDropEvent: (eventJson: string, targetDate: Date) => void;
}

export function WeekAgendaView({
  weekDays,
  events,
  selectedDate,
  onSelectDate,
  canManageEvents,
  isAuthenticated,
  onDeleteEvent,
  onEditEvent,
  onDropEvent,
}: WeekAgendaViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalHeight = HOURS.length * HOUR_HEIGHT;

  // Group events by day and separate all-day events
  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed = new Map<string, CalendarEvent[]>();
    const allDay = new Map<string, CalendarEvent[]>();
    weekDays.forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      timed.set(key, []);
      allDay.set(key, []);
    });
    events.forEach((ev) => {
      const key = format(parseISO(ev.start), 'yyyy-MM-dd');
      if (ev.allDay) {
        allDay.get(key)?.push(ev);
      } else {
        timed.get(key)?.push(ev);
      }
    });
    return { timedByDay: timed, allDayByDay: allDay };
  }, [events, weekDays]);

  const hasAllDay = useMemo(() =>
    weekDays.some((d) => (allDayByDay.get(format(d, 'yyyy-MM-dd')) || []).length > 0),
    [weekDays, allDayByDay]
  );

  // Current time indicator
  const now = new Date();
  const nowMinutes = differenceInMinutes(now, setMinutes(setHours(startOfDay(now), START_HOUR), 0));
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;
  const showNowLine = nowMinutes >= 0 && nowMinutes < (END_HOUR - START_HOUR) * 60;

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="flex border-b border-border/40 sticky top-0 z-20 bg-card">
        <div className="w-12 shrink-0" /> {/* gutter for time labels */}
        {weekDays.map((day) => {
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 transition-colors min-w-0',
                selected && 'bg-primary/5',
              )}
            >
              <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {format(day, 'EEE')}
              </span>
              <span
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-0.5 transition-colors',
                  today && 'bg-primary text-primary-foreground',
                  !today && selected && 'bg-primary/10 text-primary',
                  !today && !selected && 'text-foreground',
                )}
              >
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day events row */}
      {hasAllDay && (
        <div className="flex border-b border-border/30 bg-muted/10">
          <div className="w-12 shrink-0 flex items-center justify-center">
            <span className="text-[8px] text-muted-foreground/50 uppercase font-semibold">All day</span>
          </div>
          {weekDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayAllDay = allDayByDay.get(key) || [];
            return (
              <div key={key} className="flex-1 min-w-0 px-0.5 py-1 space-y-0.5">
                {dayAllDay.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white truncate"
                    style={{ background: getEventColor(ev.id) }}
                    title={getDisplayTitle(ev, isAuthenticated)}
                  >
                    {getDisplayTitle(ev, isAuthenticated)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 420 }}>
        <div className="flex relative" style={{ height: totalHeight }}>
          {/* Time labels */}
          <div className="w-12 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT - 6 }}
              >
                <span className="text-[9px] text-muted-foreground/50 font-medium leading-none">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => (
            <AgendaDayColumn
              key={format(day, 'yyyy-MM-dd')}
              day={day}
              events={timedByDay.get(format(day, 'yyyy-MM-dd')) || []}
              canManageEvents={canManageEvents}
              isAuthenticated={isAuthenticated}
              onDeleteEvent={onDeleteEvent}
              onEditEvent={onEditEvent}
              onDropEvent={onDropEvent}
              showNowLine={showNowLine}
              nowTop={nowTop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
