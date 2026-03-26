import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
  addDays,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  ExternalLink,
  CalendarDays,
  Grid3X3,
  Plus,
  Link2,
  Link2Off,
  Trash2,
  X,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

const EVENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--destructive))',
  'hsl(var(--accent))',
];

function getEventColor(index: number) {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

function getDisplayTitle(event: CalendarEvent, isAuthenticated: boolean) {
  if (event.title && event.title !== '(No title)') return event.title;
  return isAuthenticated ? 'Untitled event' : 'Busy';
}

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
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
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
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

function useCalendarConnection() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-connection'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'status' },
      });

      if (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('unauthorized')) {
          return { connected: false, calendarEmail: null };
        }
        throw error;
      }

      return data as { connected: boolean; calendarEmail: string | null };
    },
    enabled: !!session,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

function DayCell({
  day,
  currentMonth,
  events,
  isSelected,
  onSelect,
  onDropEvent,
  canDrop,
}: {
  day: Date;
  currentMonth: Date;
  events: CalendarEvent[];
  isSelected: boolean;
  onSelect: (d: Date) => void;
  onDropEvent?: (eventJson: string, targetDate: Date) => void;
  canDrop?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);

  return (
    <button
      onClick={() => onSelect(day)}
      onDragOver={canDrop ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={canDrop ? () => setDragOver(false) : undefined}
      onDrop={canDrop ? (e) => { e.preventDefault(); setDragOver(false); const data = e.dataTransfer.getData('application/calendar-event'); if (data && onDropEvent) onDropEvent(data, day); } : undefined}
      className={cn(
        'relative flex flex-col items-center justify-start p-1 h-10 w-full rounded-lg transition-all duration-150',
        !inMonth && 'opacity-30',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        !isSelected && inMonth && 'hover:bg-muted/40',
        dragOver && 'bg-primary/20 ring-2 ring-primary/50 scale-105',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-medium leading-none',
          today && 'text-primary font-bold',
          !today && inMonth && 'text-foreground',
          !today && !inMonth && 'text-muted-foreground',
        )}
      >
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

function WeekDayColumn({
  day,
  events,
  isSelected,
  onSelect,
  onDropEvent,
  canDrop,
}: {
  day: Date;
  events: CalendarEvent[];
  isSelected: boolean;
  onSelect: (d: Date) => void;
  onDropEvent?: (eventJson: string, targetDate: Date) => void;
  canDrop?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const today = isToday(day);

  return (
    <button
      onClick={() => onSelect(day)}
      onDragOver={canDrop ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={canDrop ? () => setDragOver(false) : undefined}
      onDrop={canDrop ? (e) => { e.preventDefault(); setDragOver(false); const data = e.dataTransfer.getData('application/calendar-event'); if (data && onDropEvent) onDropEvent(data, day); } : undefined}
      className={cn(
        'flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all duration-150 min-w-0',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        !isSelected && 'hover:bg-muted/40',
        dragOver && 'bg-primary/20 ring-2 ring-primary/50 scale-105',
      )}
    >
      <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
        {format(day, 'EEE')}
      </span>
      <span
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
          today && 'bg-primary text-primary-foreground',
          !today && 'text-foreground',
        )}
      >
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

function EventCard({
  event,
  index,
  canEdit,
  isAuthenticated,
  onDelete,
  onEdit,
}: {
  event: CalendarEvent;
  index: number;
  canEdit: boolean;
  isAuthenticated: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: { title: string; startTime: string; endTime: string; allDay: boolean; date: string }) => Promise<void>;
}) {
  const color = getEventColor(index);
  const displayTitle = getDisplayTitle(event, isAuthenticated);
  const startTime = event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a');
  const endTime = !event.allDay && event.end ? format(parseISO(event.end), 'h:mm a') : null;

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(displayTitle);
  const [editStart, setEditStart] = useState(!event.allDay ? format(parseISO(event.start), 'HH:mm') : '09:00');
  const [editEnd, setEditEnd] = useState(!event.allDay && event.end ? format(parseISO(event.end), 'HH:mm') : '10:00');
  const [editAllDay, setEditAllDay] = useState(event.allDay);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (editing) return;
    setEditTitle(displayTitle);
    setEditStart(!event.allDay ? format(parseISO(event.start), 'HH:mm') : '09:00');
    setEditEnd(!event.allDay && event.end ? format(parseISO(event.end), 'HH:mm') : '10:00');
    setEditAllDay(event.allDay);
  }, [event.id, event.title, event.start, event.end, event.allDay, displayTitle, editing]);

  const handleSave = async () => {
    if (!editTitle.trim() || savingEdit) return;

    setSavingEdit(true);
    try {
      await onEdit(event.id, {
        title: editTitle.trim(),
        startTime: editStart,
        endTime: editEnd,
        allDay: editAllDay,
        date: format(parseISO(event.start), 'yyyy-MM-dd'),
      });
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
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
          <button
            onClick={() => setEditing(false)}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full bg-background/80 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={editAllDay}
              onChange={(e) => setEditAllDay(e.target.checked)}
              className="rounded border-border"
            />
            All day
          </label>
          {!editAllDay && (
            <>
              <input
                type="time"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">–</span>
              <input
                type="time"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground"
              />
            </>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!editTitle.trim() || savingEdit}
          className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {savingEdit ? 'Saving…' : 'Save Changes'}
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
      draggable={canEdit}
      onDragStart={canEdit ? (e: any) => {
        e.dataTransfer.setData('application/calendar-event', JSON.stringify(event));
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
    >
      <div
        className={cn(
          'flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:border-border/60 transition-all duration-200',
          canEdit && 'cursor-grab active:cursor-grabbing',
        )}
        style={{ borderLeftWidth: '3px', borderLeftColor: color }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug truncate">{displayTitle}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {startTime}
              {endTime ? ` – ${endTime}` : ''}
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
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Edit event"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => onDelete(event.id)}
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Delete event"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Open in Google Calendar"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function QuickAddEvent({
  date,
  onClose,
  onCreated,
}: {
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
      const nextDateStr = format(addDays(date, 1), 'yyyy-MM-dd');
      const event = allDay
        ? { summary: title.trim(), start: { date: dateStr }, end: { date: nextDateStr } }
        : {
            summary: title.trim(),
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
        <button
          onClick={onClose}
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        className="w-full bg-background/80 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
      />

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="rounded border-border"
          />
          All day
        </label>
        {!allDay && (
          <>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-background/80 border border-border/50 rounded px-2 py-1 text-[10px] text-foreground"
            />
            <span className="text-[10px] text-muted-foreground">–</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
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

export function CalendarWidget() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useCalendarEvents(currentMonth);
  const events = data?.events || [];
  const isAuthenticated = data?.authenticated || false;

  const { data: connectionStatus } = useCalendarConnection();
  const isConnected = connectionStatus?.connected || false;
  const canManageEvents = isConnected && isAuthenticated;

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
  }, [queryClient]);

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

  const handleEditEvent = async (
    eventId: string,
    updates: { title: string; startTime: string; endTime: string; allDay: boolean; date: string },
  ) => {
    try {
      if (!updates.allDay && updates.endTime <= updates.startTime) {
        toast.error('End time must be after start time');
        return;
      }

      const date = parseISO(`${updates.date}T00:00:00`);
      const dateStr = format(date, 'yyyy-MM-dd');
      const nextDateStr = format(addDays(date, 1), 'yyyy-MM-dd');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const event = updates.allDay
        ? { summary: updates.title, start: { date: dateStr }, end: { date: nextDateStr } }
        : {
            summary: updates.title,
            start: { dateTime: `${dateStr}T${updates.startTime}:00`, timeZone: tz },
            end: { dateTime: `${dateStr}T${updates.endTime}:00`, timeZone: tz },
          };

      const { error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'update', eventId, event },
      });
      if (error) throw error;

      toast.success('Event updated');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update event');
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const monthDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const selectedEvents = useMemo(() => {
    return events.filter((e) => {
      const eventDate = parseISO(e.start);
      return isSameDay(eventDate, selectedDate);
    });
  }, [events, selectedDate]);

  const priorityEvents = useMemo(() => {
    const now = new Date().getTime();
    return [...events]
      .filter((event) => {
        const end = parseISO(event.end || event.start).getTime();
        return end >= now;
      })
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
      .slice(0, 3);
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const key = format(parseISO(e.start), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  const handleDropEvent = useCallback((eventJson: string, targetDate: Date) => {
    if (!canManageEvents) return;
    try {
      const droppedEvent = JSON.parse(eventJson) as CalendarEvent;
      const originalDate = format(parseISO(droppedEvent.start), 'yyyy-MM-dd');
      const newDate = format(targetDate, 'yyyy-MM-dd');
      if (originalDate === newDate) return;

      const displayTitle = droppedEvent.title && droppedEvent.title !== '(No title)' ? droppedEvent.title : 'Untitled event';
      const startTime = !droppedEvent.allDay ? format(parseISO(droppedEvent.start), 'HH:mm') : '09:00';
      const endTime = !droppedEvent.allDay && droppedEvent.end ? format(parseISO(droppedEvent.end), 'HH:mm') : '10:00';

      handleEditEvent(droppedEvent.id, {
        title: displayTitle,
        startTime,
        endTime,
        allDay: droppedEvent.allDay,
        date: newDate,
      });
      setSelectedDate(targetDate);
    } catch (err) {
      console.error('Drop failed:', err);
    }
  }, [canManageEvents, handleEditEvent]);

  const navigateBack = () => {
    if (viewMode === 'month') {
      setCurrentMonth((m) => subMonths(m, 1));
    } else {
      const newDate = subWeeks(selectedDate, 1);
      setSelectedDate(newDate);
      if (!isSameMonth(newDate, currentMonth)) setCurrentMonth(startOfMonth(newDate));
    }
  };

  const navigateForward = () => {
    if (viewMode === 'month') {
      setCurrentMonth((m) => addMonths(m, 1));
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

  const headerLabel =
    viewMode === 'month'
      ? format(currentMonth, 'MMMM yyyy')
      : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-3 bg-card/80 backdrop-blur-sm">
        <CalendarDays className="w-4.5 h-4.5 text-primary" />
        <h2 className="text-sm font-bold text-foreground tracking-tight">Calendar</h2>
        <span className="text-[10px] text-muted-foreground/60 ml-1">Live every 30s</span>

        <div className="flex-1" />

        <button
          onClick={navigateBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-foreground min-w-[120px] text-center">{headerLabel}</span>
        <button
          onClick={navigateForward}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex items-center bg-muted/40 rounded-lg p-0.5 ml-2">
          <button
            onClick={() => setViewMode('month')}
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center transition-all',
              viewMode === 'month' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            title="Month view"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center transition-all',
              viewMode === 'week' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            title="Week view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>
        </div>

        {isConnected ? (
          <button
            onClick={handleDisconnect}
            className="w-7 h-7 rounded-md flex items-center justify-center text-success hover:text-destructive hover:bg-destructive/10 transition-all"
            title={`Connected: ${connectionStatus?.calendarEmail || 'Google Calendar'} — click to disconnect`}
          >
            <Link2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            title="Connect Google Calendar"
          >
            <Link2Off className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={goToday}
          className="text-[11px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-colors"
        >
          Today
        </button>
      </div>

      {/* ── Body: side-by-side on desktop ───────────────────────── */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Calendar grid */}
        <div className="lg:w-[55%] xl:w-[60%] border-b lg:border-b-0 lg:border-r border-border/40">
          <AnimatePresence mode="wait">
            {viewMode === 'month' ? (
              <motion.div
                key="month"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-4 pt-4 pb-3"
              >
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div
                      key={d}
                      className="text-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1.5"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {monthDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    return (
                      <DayCell
                        key={key}
                        day={day}
                        currentMonth={currentMonth}
                        events={eventsByDay.get(key) || []}
                        isSelected={isSameDay(day, selectedDate)}
                        onSelect={setSelectedDate}
                        onDropEvent={handleDropEvent}
                        canDrop={canManageEvents}
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
                className="px-4 pt-4 pb-3"
              >
                <div className="grid grid-cols-7 gap-1.5">
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    return (
                      <WeekDayColumn
                        key={key}
                        day={day}
                        events={eventsByDay.get(key) || []}
                        isSelected={isSameDay(day, selectedDate)}
                        onSelect={setSelectedDate}
                        onDropEvent={handleDropEvent}
                        canDrop={canManageEvents}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Priority section under calendar grid */}
          {priorityEvents.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mx-4 mb-3 p-3 rounded-xl border border-primary/10 bg-primary/5"
            >
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Up Next</span>
              <div className="mt-2 space-y-1.5">
                {priorityEvents.map((event, i) => (
                  <div key={event.id} className="flex items-center gap-2.5 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getEventColor(i) }} />
                    <span className="text-muted-foreground w-[56px] shrink-0 font-medium">
                      {event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a')}
                    </span>
                    <span className="text-foreground truncate">{getDisplayTitle(event, isAuthenticated)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Events panel */}
        <div className="lg:w-[45%] xl:w-[40%] flex flex-col min-h-[280px] lg:min-h-[360px]">
          <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between bg-muted/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMM d')}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">
                {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
            {canManageEvents && (
              <button
                onClick={() => setShowAddEvent((v) => !v)}
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                  showAddEvent
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                )}
                title="Add event"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <AnimatePresence>
              {showAddEvent && canManageEvents && (
                <div className="mb-3">
                  <QuickAddEvent
                    date={selectedDate}
                    onClose={() => setShowAddEvent(false)}
                    onCreated={() => queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] })}
                  />
                </div>
              )}
            </AnimatePresence>

            {!isConnected && !isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-3 p-4 rounded-xl border border-primary/20 bg-primary/5 text-center"
              >
                <p className="text-xs text-muted-foreground mb-2">
                  Connect Google Calendar for full titles + edit controls.
                </p>
                <button onClick={handleConnect} className="text-xs font-semibold text-primary hover:underline">
                  Connect Now →
                </button>
              </motion.div>
            )}

            {isConnected && !isAuthenticated && !isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-3 p-3 rounded-xl border border-border/40 bg-muted/20 text-center"
              >
                <p className="text-[11px] text-muted-foreground">
                  Re-authenticate to restore full title visibility.
                </p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
                  ))}
                </motion.div>
              ) : isError ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center"
                >
                  <p className="text-xs text-muted-foreground">Could not load events</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Check your calendar connection</p>
                </motion.div>
              ) : selectedEvents.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center"
                >
                  <CalendarDays className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No events scheduled</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {canManageEvents ? 'Click + to add an event' : 'Auto-refreshes every 30s'}
                  </p>
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
                    <EventCard
                      key={event.id}
                      event={event}
                      index={i}
                      canEdit={canManageEvents}
                      isAuthenticated={isAuthenticated}
                      onDelete={handleDeleteEvent}
                      onEdit={handleEditEvent}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
