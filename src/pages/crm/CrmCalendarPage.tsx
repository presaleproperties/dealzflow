import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core';
import {
  CalendarDays,
  Plus,
  Link2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  MapPin,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useCrmShowings, useUpdateShowingStatus } from '@/hooks/useCrmShowings';
import {
  useGoogleCalendarEvents,
  useGoogleCalendarConnection,
  type GoogleCalendarEvent,
} from '@/hooks/useGoogleCalendarEvents';
import { AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { BookShowingModal } from '@/components/crm/calendar/BookShowingModal';
import { ShowingDetailModal } from '@/components/crm/calendar/ShowingDetailModal';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addDays,
  isToday,
  isTomorrow,
  parseISO,
} from 'date-fns';
import type { CrmShowingWithContact } from '@/hooks/useCrmShowings';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'hsl(39 90% 50%)',
  completed: 'hsl(142 60% 45%)',
  cancelled: 'hsl(220 10% 60%)',
  'no-show': 'hsl(0 70% 55%)',
};

const GCAL_COLOR = 'hsl(214 89% 52%)';

type ViewKey =
  | 'timeGridDay'
  | 'timeGridThreeDay'
  | 'timeGridWeek'
  | 'dayGridMonth'
  | 'listMonth';

const MOBILE_VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'listMonth', label: 'Agenda' },
  { key: 'timeGridDay', label: 'Day' },
  { key: 'timeGridThreeDay', label: '3 Day' },
  { key: 'dayGridMonth', label: 'Month' },
];

const DESKTOP_VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'timeGridDay', label: 'Day' },
  { key: 'timeGridWeek', label: 'Week' },
  { key: 'dayGridMonth', label: 'Month' },
  { key: 'listMonth', label: 'Agenda' },
];

export default function CrmCalendarPage() {
  const { data: showings, isLoading } = useCrmShowings();
  const updateStatus = useUpdateShowingStatus();
  const isMobile = useIsMobile();

  const calendarRef = useRef<FullCalendar | null>(null);

  // Visible date range — drives both the calendar and GCal fetching.
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() => ({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  }));
  const [titleText, setTitleText] = useState<string>(format(new Date(), 'MMMM yyyy'));

  const [view, setView] = useState<ViewKey>(isMobile ? 'listMonth' : 'timeGridWeek');

  // Fetch a slightly padded window so list/agenda show enough.
  const fetchStart = useMemo(
    () => startOfDay(addDays(visibleRange.start, -1)).toISOString(),
    [visibleRange.start],
  );
  const fetchEnd = useMemo(
    () => endOfDay(addDays(visibleRange.end, 1)).toISOString(),
    [visibleRange.end],
  );

  const { data: connectionData } = useGoogleCalendarConnection();
  const { data: gcalData } = useGoogleCalendarEvents(fetchStart, fetchEnd);
  const isGCalConnected = connectionData?.connected ?? false;

  const [agentFilter, setAgentFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [bookOpen, setBookOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailShowing, setDetailShowing] = useState<CrmShowingWithContact | null>(null);
  const [showGCalEvents, setShowGCalEvents] = useState(true);

  // Keep calendar instance in sync with view state.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (api.view.type !== view) api.changeView(view);
  }, [view]);

  const filteredShowings = useMemo(() => {
    if (!showings) return [];
    return showings
      .filter((s) => agentFilter === 'all' || s.assigned_agent === agentFilter)
      .filter((s) => projectFilter === 'all' || s.project === projectFilter);
  }, [showings, agentFilter, projectFilter]);

  const showingEvents = useMemo(() => {
    return filteredShowings.map((s) => {
      const name = s.crm_contacts
        ? formatContactName(s.crm_contacts.first_name, s.crm_contacts.last_name)
        : 'Unknown';
      const status = s.status ?? 'confirmed';
      return {
        id: s.id,
        title: `${name} — ${s.project}`,
        start: `${s.showing_date}T${s.showing_time}`,
        backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.confirmed,
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: { showing: s, source: 'local' as const, status },
      };
    });
  }, [filteredShowings]);

  const googleEvents = useMemo(() => {
    if (!showGCalEvents || !gcalData?.events) return [];
    return gcalData.events.map((e: GoogleCalendarEvent) => ({
      id: `gcal-${e.id}`,
      title: e.title || 'Busy',
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      backgroundColor: GCAL_COLOR,
      borderColor: 'transparent',
      textColor: '#fff',
      classNames: ['gcal-event'],
      extendedProps: {
        source: 'google' as const,
        htmlLink: e.htmlLink,
        location: e.location,
      },
    }));
  }, [gcalData, showGCalEvents]);

  const allEvents = useMemo(
    () => [...showingEvents, ...googleEvents],
    [showingEvents, googleEvents],
  );

  const handleEventClick = useCallback((info: EventClickArg) => {
    const source = info.event.extendedProps.source;
    if (source === 'google') {
      const link = info.event.extendedProps.htmlLink;
      if (link) window.open(link, '_blank');
      return;
    }
    const s = info.event.extendedProps.showing as CrmShowingWithContact;
    setDetailShowing(s);
  }, []);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setVisibleRange({ start: arg.start, end: arg.end });
    setCurrentDate(arg.view.currentStart);
    setTitleText(arg.view.title);
  }, []);

  const goPrev = () => calendarRef.current?.getApi().prev();
  const goNext = () => calendarRef.current?.getApi().next();
  const goToday = () => calendarRef.current?.getApi().today();

  const activeFilterCount =
    (agentFilter !== 'all' ? 1 : 0) + (projectFilter !== 'all' ? 1 : 0);

  // ---- Custom mobile-friendly Agenda data (used as our list rendering)
  // FullCalendar's listMonth view works well, but we render a custom one on
  // mobile for a more "Apple Calendar"–style grouped agenda.
  const agendaItems = useMemo(() => {
    type Item = {
      id: string;
      start: Date;
      end?: Date;
      allDay?: boolean;
      title: string;
      subtitle?: string;
      color: string;
      badge: string;
      onClick: () => void;
    };
    const items: Item[] = [];

    filteredShowings.forEach((s) => {
      const start = new Date(`${s.showing_date}T${s.showing_time}`);
      if (start < visibleRange.start || start > visibleRange.end) return;
      const name = s.crm_contacts
        ? formatContactName(s.crm_contacts.first_name, s.crm_contacts.last_name)
        : 'Unknown';
      const status = s.status ?? 'confirmed';
      items.push({
        id: s.id,
        start,
        title: s.project,
        subtitle: name + (s.unit ? ` · Unit ${s.unit}` : ''),
        color: STATUS_COLORS[status] ?? STATUS_COLORS.confirmed,
        badge: status,
        onClick: () => setDetailShowing(s),
      });
    });

    if (showGCalEvents && gcalData?.events) {
      gcalData.events.forEach((e) => {
        const start = parseISO(e.start);
        if (start < visibleRange.start || start > visibleRange.end) return;
        items.push({
          id: `gcal-${e.id}`,
          start,
          end: e.end ? parseISO(e.end) : undefined,
          allDay: e.allDay,
          title: e.title || 'Busy',
          subtitle: e.location || undefined,
          color: GCAL_COLOR,
          badge: 'Google',
          onClick: () => e.htmlLink && window.open(e.htmlLink, '_blank'),
        });
      });
    }

    items.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Group by day key
    const groups = new Map<string, { date: Date; items: typeof items }>();
    items.forEach((it) => {
      const key = format(it.start, 'yyyy-MM-dd');
      if (!groups.has(key)) groups.set(key, { date: it.start, items: [] });
      groups.get(key)!.items.push(it);
    });

    return Array.from(groups.values());
  }, [filteredShowings, gcalData, showGCalEvents, visibleRange]);

  const dayLabel = (d: Date) => {
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  };

  const showAgenda = view === 'listMonth';
  const viewOptions = isMobile ? MOBILE_VIEWS : DESKTOP_VIEWS;

  return (
    <div className="space-y-3 sm:space-y-4 crm-mobile-page">
      {/* Google Calendar Connection Banner */}
      {!isGCalConnected && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
          <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-xs sm:text-sm text-muted-foreground flex-1">
            Connect Google Calendar to see all your events here.
          </p>
          <Link
            to="/settings"
            className="text-xs font-semibold text-primary hover:underline shrink-0"
          >
            Connect
          </Link>
        </div>
      )}

      {/* Header — sticky on mobile for easy navigation */}
      <div className="sticky top-0 z-20 -mx-3 px-3 sm:mx-0 sm:px-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 pb-2 pt-1 sm:static sm:bg-transparent sm:backdrop-blur-0 sm:pb-0 sm:pt-0">
        {/* Row 1: Title + add */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="m-page-title sm:!text-xl truncate">
                {titleText}
              </h1>
              <p className="text-[11px] text-muted-foreground sm:hidden">Showings & Calendar</p>
            </div>
          </div>
          <Button
            onClick={() => setBookOpen(true)}
            className="gap-1.5 h-9 min-h-[40px]"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Book Showing</span>
            <span className="sm:hidden">Book</span>
          </Button>
        </div>

        {/* Row 2: Navigation + view switcher */}
        <div className="mt-2 flex items-center gap-2">
          {/* Prev / Today / Next */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-0.5">
            <button
              onClick={goPrev}
              aria-label="Previous"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted active:bg-muted/70 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="h-8 px-2.5 text-xs font-semibold rounded-md hover:bg-muted active:bg-muted/70 transition-colors"
            >
              Today
            </button>
            <button
              onClick={goNext}
              aria-label="Next"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted active:bg-muted/70 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* View segmented control — scrollable on mobile */}
          <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
              {viewOptions.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    'h-8 px-3 text-xs font-semibold rounded-md whitespace-nowrap transition-colors',
                    view === v.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters — collapsed into a sheet on mobile, inline on desktop */}
          {isMobile ? (
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <button
                  className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-card/60 hover:bg-muted active:bg-muted/70 transition-colors"
                  aria-label="Filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {(activeFilterCount > 0 || (isGCalConnected && !showGCalEvents)) && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold inline-flex items-center justify-center">
                      {activeFilterCount + (isGCalConnected && !showGCalEvents ? 1 : 0)}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Agent</label>
                    <Select value={agentFilter} onValueChange={setAgentFilter}>
                      <SelectTrigger className="h-11 text-base">
                        <SelectValue placeholder="All Agents" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {AGENTS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Project</label>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="h-11 text-base">
                        <SelectValue placeholder="All Projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {PROJECTS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isGCalConnected && (
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
                      <div>
                        <p className="text-sm font-semibold">Google Calendar</p>
                        <p className="text-xs text-muted-foreground">Show events from your Google account</p>
                      </div>
                      <Switch checked={showGCalEvents} onCheckedChange={setShowGCalEvents} />
                    </label>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-11"
                      onClick={() => {
                        setAgentFilter('all');
                        setProjectFilter('all');
                      }}
                    >
                      Reset
                    </Button>
                    <Button className="flex-1 h-11" onClick={() => setFiltersOpen(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {AGENTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {PROJECTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isGCalConnected && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Switch checked={showGCalEvents} onCheckedChange={setShowGCalEvents} className="scale-75" />
                  Google Calendar
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="h-[400px] sm:h-[600px] rounded-xl bg-muted/30 animate-pulse" />
      ) : isMobile && showAgenda ? (
        // Custom mobile agenda — Apple Calendar style grouped list.
        <div className="space-y-4">
          {agendaItems.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No events in this range</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-10"
                onClick={() => setBookOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> Book a showing
              </Button>
            </div>
          ) : (
            agendaItems.map((group) => (
              <div key={format(group.date, 'yyyy-MM-dd')}>
                <div
                  className={cn(
                    'sticky top-[112px] z-10 -mx-3 px-3 py-1.5 bg-background/95 backdrop-blur',
                    isToday(group.date) && 'text-primary',
                  )}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider">
                    {dayLabel(group.date)}
                  </p>
                </div>
                <div className="space-y-2 mt-1.5">
                  {group.items.map((it) => (
                    <button
                      key={it.id}
                      onClick={it.onClick}
                      className="relative w-full text-left bg-card rounded-xl border border-border p-3 shadow-sm active:bg-muted/40 active:scale-[0.99] transition-all overflow-hidden"
                    >
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ background: it.color }}
                      />
                      <div className="pl-2 flex gap-3 items-start">
                        <div className="shrink-0 text-center min-w-[52px]">
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            {it.allDay ? 'All day' : format(it.start, 'h:mm')}
                          </p>
                          {!it.allDay && (
                            <p className="text-[10px] text-muted-foreground/70">
                              {format(it.start, 'a')}
                            </p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <p className="text-sm font-semibold text-foreground truncate flex-1">
                              {it.title}
                            </p>
                            <Badge
                              variant="outline"
                              className="border-0 text-[10px] font-semibold capitalize shrink-0"
                              style={{
                                background: `${it.color}20`,
                                color: it.color,
                              }}
                            >
                              {it.badge}
                            </Badge>
                          </div>
                          {it.subtitle && (
                            <p className="text-[12px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                              {it.badge === 'Google' && it.subtitle ? (
                                <MapPin className="h-3 w-3 shrink-0" />
                              ) : null}
                              {it.subtitle}
                            </p>
                          )}
                          {it.end && !it.allDay && (
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(it.start, 'h:mm a')} – {format(it.end, 'h:mm a')}
                            </p>
                          )}
                        </div>
                        {it.badge === 'Google' && (
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card/50 p-1.5 sm:p-2 lg:p-4 calendar-wrapper">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            initialDate={currentDate}
            views={{
              timeGridThreeDay: {
                type: 'timeGrid',
                duration: { days: 3 },
                buttonText: '3 day',
              },
              listMonth: {
                listDayFormat: { weekday: 'long', month: 'short', day: 'numeric' },
                listDaySideFormat: false,
              },
            }}
            events={allEvents}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            headerToolbar={false}
            height="auto"
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            allDaySlot={view !== 'timeGridDay' && view !== 'timeGridThreeDay'}
            nowIndicator
            eventDisplay="block"
            eventBorderColor="transparent"
            dayMaxEvents={isMobile ? 2 : 3}
            firstDay={0}
            expandRows
            stickyHeaderDates
            dayHeaderClassNames="text-xs font-medium text-muted-foreground"
            noEventsText="No events to display"
          />
        </div>
      )}

      {/* Legend — desktop only; mobile keeps it clean */}
      {!isMobile && (
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{status}</span>
            </div>
          ))}
          {isGCalConnected && showGCalEvents && (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GCAL_COLOR }} />
              <span>Google Calendar</span>
            </div>
          )}
        </div>
      )}

      <BookShowingModal open={bookOpen} onOpenChange={setBookOpen} />
      <ShowingDetailModal
        showing={detailShowing}
        onClose={() => setDetailShowing(null)}
        onUpdateStatus={(id, status) => {
          updateStatus.mutate({ id, status });
          setDetailShowing(null);
        }}
      />
    </div>
  );
}
