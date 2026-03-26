import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, addWeeks, subWeeks, parseISO,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, ExternalLink,
  CalendarDays, Grid3X3, Plus, Link2, Link2Off, Trash2, X, Pencil, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

type ViewMode = 'month' | 'week';

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
  const { session } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-events', timeMin, timeMax],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/google-calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

      const headers: Record<string, string> = {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch events');
      }
      const result = await response.json();
      return {
        events: (result.events || []) as CalendarEvent[],
        authenticated: result.authenticated || false,
      };
    },
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

// ─── Calendar connection status hook ───────────────────────────────────────────
function useCalendarConnection() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-connection'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data as { connected: boolean; calendarEmail: string | null };
    },
    enabled: !!session,
    staleTime: 30_000,
  });
}

// ─── Day cell (month view) ─────────────────────────────────────────────────────
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
      {events.length > 0 && (
        <div className="flex items-center gap-0.5 mt-1">
          {events.slice(0, 3).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full" style={{ background: getEventColor(i) }} />
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Week day column ───────────────────────────────────────────────────────────
function WeekDayColumn({
  day, events, isSelected, onSelect,
}: {
  day: Date;
  events: CalendarEvent[];
  isSelected: boolean;
  onSelect: (d: Date) => void;
}) {
  const today = isToday(day);

  return (
    <button
      onClick={() => onSelect(day)}
      className={cn(
        'flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all duration-150 min-w-0',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        !isSelected && 'hover:bg-muted/40',
      )}
    >
      <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
        {format(day, 'EEE')}
      </span>
      <span className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
        today && 'bg-primary text-primary-foreground',
        !today && 'text-foreground',
      )}>
        {format(day, 'd')}
      </span>
      {events.length > 0 && (
        <div className="flex items-center gap-0.5">
          {events.slice(0, 2).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full" style={{ background: getEventColor(i) }} />
          ))}
          {events.length > 2 && (
            <span className="text-[8px] text-muted-foreground font-medium">+{events.length - 2}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Event card ────────────────────────────────────────────────────────────────
function EventCard({ event, index, canEdit, onDelete, onEdit }: {
  event: CalendarEvent;
  index: number;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: { title: string; startTime: string; endTime: string; allDay: boolean }) => void;
}) {
  const color = getEventColor(index);
  const startTime = event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a');
  const endTime = !event.allDay && event.end ? format(parseISO(event.end), 'h:mm a') : null;

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editStart, setEditStart] = useState(!event.allDay ? format(parseISO(event.start), 'HH:mm') : '09:00');
  const [editEnd, setEditEnd] = useState(!event.allDay && event.end ? format(parseISO(event.end), 'HH:mm') : '10:00');
  const [editAllDay, setEditAllDay] = useState(event.allDay);

  const handleSave = () => {
    if (!editTitle.trim()) return;
    onEdit(event.id, { title: editTitle, startTime: editStart, endTime: editEnd, allDay: editAllDay });
    setEditing(false);
  };

  if (editing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2"
        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-primary">Edit Event</span>
          <button onClick={() => setEditing(false)} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
        <input
          autoFocus
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          className="w-full bg-background/80 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={editAllDay} onChange={e => setEditAllDay(e.target.checked)} className="rounded border-border" />
            All day
          </label>
          {!editAllDay && (
            <>
              <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground" />
              <span className="text-[10px] text-muted-foreground">–</span>
              <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground" />
            </>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!editTitle.trim()}
          className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Save Changes
        </button>
      </motion.div>
    );
  }

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
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => onDelete(event.id)}
              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Quick add event form ──────────────────────────────────────────────────────
function QuickAddEvent({ date, onClose, onCreated }: {
  date: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const event = allDay
        ? { summary: title, start: { date: dateStr }, end: { date: dateStr } }
        : {
            summary: title,
            start: { dateTime: `${dateStr}T${startTime}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            end: { dateTime: `${dateStr}T${endTime}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          };

      const { error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'create', event },
      });
      if (error) throw error;
      toast.success('Event created');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-primary">New Event — {format(date, 'MMM d')}</span>
        <button onClick={onClose} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Event title"
        className="w-full bg-background/80 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            className="rounded border-border"
          />
          All day
        </label>
        {!allDay && (
          <>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground"
            />
            <span className="text-[10px] text-muted-foreground">–</span>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground"
            />
          </>
        )}
      </div>
      <button
        onClick={handleCreate}
        disabled={!title.trim() || saving}
        className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Creating…' : 'Create Event'}
      </button>
    </motion.div>
  );
}

// ─── Main widget ───────────────────────────────────────────────────────────────
export function CalendarWidget() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useCalendarEvents(currentMonth);
  const events = data?.events || [];
  const isAuthenticated = data?.authenticated || false;

  const { data: connectionStatus } = useCalendarConnection();
  const isConnected = connectionStatus?.connected || false;

  // Listen for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calAuth = params.get('calendar_auth');
    if (calAuth === 'success') {
      toast.success('Google Calendar connected!');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (calAuth === 'error') {
      toast.error(params.get('message') || 'Failed to connect Google Calendar');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Connect handler
  const handleConnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          action: 'get_auth_url',
          redirectUrl: window.location.origin + '/command-center',
        },
      });
      if (error) throw error;
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start connection');
    }
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'disconnect' },
      });
      toast.success('Google Calendar disconnected');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'delete', eventId },
      });
      if (error) throw error;
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete event');
    }
  };

  // Build month calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const monthDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Build week view days
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const selectedEvents = useMemo(() => {
    return events.filter(e => {
      const eventDate = parseISO(e.start);
      return isSameDay(eventDate, selectedDate);
    });
  }, [events, selectedDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(e => {
      const key = format(parseISO(e.start), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  const navigateBack = () => {
    if (viewMode === 'month') {
      setCurrentMonth(m => subMonths(m, 1));
    } else {
      const newDate = subWeeks(selectedDate, 1);
      setSelectedDate(newDate);
      if (!isSameMonth(newDate, currentMonth)) setCurrentMonth(startOfMonth(newDate));
    }
  };

  const navigateForward = () => {
    if (viewMode === 'month') {
      setCurrentMonth(m => addMonths(m, 1));
    } else {
      const newDate = addWeeks(selectedDate, 1);
      setSelectedDate(newDate);
      if (!isSameMonth(newDate, currentMonth)) setCurrentMonth(startOfMonth(newDate));
    }
  };

  const goToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const headerLabel = viewMode === 'month'
    ? format(currentMonth, 'MMMM yyyy')
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 shrink-0">
        <button
          onClick={navigateBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold text-foreground flex-1 text-center">
          {headerLabel}
        </h2>
        <button
          onClick={navigateForward}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* View toggle */}
        <div className="flex items-center bg-muted/40 rounded-lg p-0.5 ml-1">
          <button
            onClick={() => setViewMode('month')}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-all',
              viewMode === 'month'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Month view"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-all',
              viewMode === 'week'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Week view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Connection status */}
        {isConnected ? (
          <button
            onClick={handleDisconnect}
            className="w-6 h-6 rounded-md flex items-center justify-center text-emerald-500 hover:text-destructive hover:bg-destructive/10 transition-all"
            title={`Connected: ${connectionStatus?.calendarEmail || 'Google Calendar'} — click to disconnect`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            title="Connect Google Calendar"
          >
            <Link2Off className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={goToday}
          className="text-[10px] font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-colors"
        >
          Today
        </button>
      </div>

      {/* ── Calendar grid ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === 'month' ? (
          <motion.div
            key="month"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-3 pt-3 pb-2"
          >
            <div className="grid grid-cols-7 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {monthDays.map(day => {
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
          </motion.div>
        ) : (
          <motion.div
            key="week"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-3 pt-3 pb-2"
          >
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                return (
                  <WeekDayColumn
                    key={key}
                    day={day}
                    events={eventsByDay.get(key) || []}
                    isSelected={isSameDay(day, selectedDate)}
                    onSelect={setSelectedDate}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Selected day events ─────────────────────────────── */}
      <div className="flex-1 border-t border-border/40 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-foreground">
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
              </span>
              {isConnected && (
                <button
                  onClick={() => setShowAddEvent(v => !v)}
                  className={cn(
                    'w-5 h-5 rounded-md flex items-center justify-center transition-all',
                    showAddEvent
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                  )}
                  title="Add event"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick add form */}
          <AnimatePresence>
            {showAddEvent && isConnected && (
              <div className="mb-3">
                <QuickAddEvent
                  date={selectedDate}
                  onClose={() => setShowAddEvent(false)}
                  onCreated={() => queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] })}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Connect prompt */}
          {!isConnected && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-3 p-3 rounded-xl border border-border/40 bg-muted/20 text-center"
            >
              <p className="text-[11px] text-muted-foreground mb-2">
                Connect Google Calendar for full access — see titles, create & edit events
              </p>
              <button
                onClick={handleConnect}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Connect Now →
              </button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </motion.div>
            ) : isError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs text-muted-foreground">Could not load events</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Check your calendar connection</p>
              </motion.div>
            ) : selectedEvents.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs text-muted-foreground">No events scheduled</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {isConnected ? 'Click + to add an event' : 'Enjoy the free time ✨'}
                </p>
              </motion.div>
            ) : (
              <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                {selectedEvents.map((event, i) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={i}
                    canEdit={isConnected}
                    onDelete={handleDeleteEvent}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
