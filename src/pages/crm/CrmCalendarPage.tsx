import { useState, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { CalendarDays, Plus, List, LayoutGrid, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmShowings, useUpdateShowingStatus } from '@/hooks/useCrmShowings';
import { useGoogleCalendarEvents, useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarEvents';
import { AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { BookShowingModal } from '@/components/crm/calendar/BookShowingModal';
import { ShowingDetailModal } from '@/components/crm/calendar/ShowingDetailModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import type { CrmShowingWithContact } from '@/hooks/useCrmShowings';
import { Link } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'hsl(39 90% 50%)',
  completed: 'hsl(142 60% 45%)',
  cancelled: 'hsl(220 10% 60%)',
  'no-show': 'hsl(0 70% 55%)',
};

const GCAL_COLOR = 'hsl(214 89% 52%)';

export default function CrmCalendarPage() {
  const { data: showings, isLoading } = useCrmShowings();
  const updateStatus = useUpdateShowingStatus();
  const isMobile = useIsMobile();

  const [currentMonth] = useState(() => new Date());
  const timeMin = startOfMonth(currentMonth).toISOString();
  const timeMax = endOfMonth(currentMonth).toISOString();

  const { data: connectionData } = useGoogleCalendarConnection();
  const { data: gcalData } = useGoogleCalendarEvents(timeMin, timeMax);
  const isGCalConnected = connectionData?.connected ?? false;

  const [view, setView] = useState<'timeGridWeek' | 'dayGridMonth'>('timeGridWeek');
  const [mobileView, setMobileView] = useState<'list' | 'calendar'>('list');
  const [agentFilter, setAgentFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [bookOpen, setBookOpen] = useState(false);
  const [detailShowing, setDetailShowing] = useState<CrmShowingWithContact | null>(null);
  const [showGCalEvents, setShowGCalEvents] = useState(true);

  const filteredShowings = useMemo(() => {
    if (!showings) return [];
    return showings
      .filter(s => agentFilter === 'all' || s.assigned_agent === agentFilter)
      .filter(s => projectFilter === 'all' || s.project === projectFilter);
  }, [showings, agentFilter, projectFilter]);

  const showingEvents = useMemo(() => {
    return filteredShowings.map(s => {
      const name = s.crm_contacts ? formatContactName(s.crm_contacts.first_name, s.crm_contacts.last_name) : 'Unknown';
      const status = s.status ?? 'confirmed';
      return {
        id: s.id,
        title: `${name} — ${s.project}`,
        start: `${s.showing_date}T${s.showing_time}`,
        backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.confirmed,
        borderColor: 'transparent',
        extendedProps: { showing: s, source: 'local' as const },
      };
    });
  }, [filteredShowings]);

  const googleEvents = useMemo(() => {
    if (!showGCalEvents || !gcalData?.events) return [];
    return gcalData.events.map(e => ({
      id: `gcal-${e.id}`,
      title: e.title || 'Busy',
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      backgroundColor: GCAL_COLOR,
      borderColor: 'transparent',
      classNames: ['gcal-event'],
      extendedProps: { source: 'google' as const, htmlLink: e.htmlLink, location: e.location },
    }));
  }, [gcalData, showGCalEvents]);

  const allEvents = useMemo(() => [...showingEvents, ...googleEvents], [showingEvents, googleEvents]);

  const upcomingShowings = useMemo(() => {
    return [...filteredShowings]
      .filter(s => new Date(`${s.showing_date}T${s.showing_time}`) >= new Date())
      .sort((a, b) => new Date(`${a.showing_date}T${a.showing_time}`).getTime() - new Date(`${b.showing_date}T${b.showing_time}`).getTime());
  }, [filteredShowings]);

  const upcomingGCal = useMemo(() => {
    if (!showGCalEvents || !gcalData?.events) return [];
    return gcalData.events
      .filter(e => new Date(e.start) >= new Date())
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 10);
  }, [gcalData, showGCalEvents]);

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

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Google Calendar Connection Banner */}
      {!isGCalConnected && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
          <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            Connect Google Calendar to see all your events here.
          </p>
          <Link to="/settings" className="text-xs font-semibold text-primary hover:underline shrink-0">
            Connect
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Showings Calendar</h1>
          </div>
          <Button onClick={() => setBookOpen(true)} className="gap-1.5 h-9 min-h-[44px] sm:min-h-0" size="sm">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Book Showing</span><span className="sm:hidden">Book</span>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {isMobile && (
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setMobileView('list')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium min-h-[44px] transition-colors ${mobileView === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button
                onClick={() => setMobileView('calendar')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium min-h-[44px] transition-colors ${mobileView === 'calendar' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Calendar
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isMobile && (
              <Select value={view} onValueChange={v => setView(v as 'timeGridWeek' | 'dayGridMonth')}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeGridWeek">Week</SelectItem>
                  <SelectItem value="dayGridMonth">Month</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 w-full sm:w-36 min-h-[44px] sm:min-h-0"><SelectValue placeholder="All Agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 min-h-[44px] sm:min-h-0"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {isGCalConnected && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Switch checked={showGCalEvents} onCheckedChange={setShowGCalEvents} className="scale-75" />
                Google Calendar
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="h-[400px] sm:h-[600px] rounded-xl bg-muted/30 animate-pulse" />
      ) : isMobile && mobileView === 'list' ? (
        <div className="space-y-2">
          {upcomingShowings.length === 0 && upcomingGCal.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No upcoming showings</p>
          ) : (
            <>
              {upcomingShowings.map(s => {
                const name = s.crm_contacts ? formatContactName(s.crm_contacts.first_name, s.crm_contacts.last_name) : 'Unknown';
                const status = s.status ?? 'confirmed';
                return (
                  <button
                    key={s.id}
                    onClick={() => setDetailShowing(s)}
                    className="w-full text-left bg-card rounded-[10px] border border-border p-3 shadow-sm active:bg-muted/40 transition-colors"
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 text-center min-w-[48px]">
                        <p className="text-sm font-bold text-foreground">{format(new Date(s.showing_date), 'MMM d')}</p>
                        <p className="text-xs text-muted-foreground">{s.showing_time?.slice(0, 5)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{s.project}</p>
                          <Badge
                            variant="outline"
                            className="border-0 text-[10px] font-semibold capitalize shrink-0"
                            style={{ background: `${STATUS_COLORS[status]}20`, color: STATUS_COLORS[status] }}
                          >
                            {status}
                          </Badge>
                        </div>
                        <p className="text-[13px] text-muted-foreground truncate mt-0.5">{name}</p>
                        {s.unit && <p className="text-[12px] text-muted-foreground">Unit: {s.unit}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {upcomingGCal.map(e => (
                <a
                  key={e.id}
                  href={e.htmlLink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-left bg-card/60 rounded-[10px] border border-border/50 p-3 shadow-sm active:bg-muted/40 transition-colors"
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 text-center min-w-[48px]">
                      <p className="text-sm font-bold text-foreground">{format(parseISO(e.start), 'MMM d')}</p>
                      <p className="text-xs text-muted-foreground">{e.allDay ? 'All day' : format(parseISO(e.start), 'h:mm a')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground/80 truncate">{e.title || 'Busy'}</p>
                        <Badge variant="outline" className="border-0 text-[10px] font-semibold shrink-0" style={{ background: `${GCAL_COLOR}20`, color: GCAL_COLOR }}>
                          Google
                        </Badge>
                      </div>
                      {e.location && <p className="text-[12px] text-muted-foreground truncate mt-0.5">{e.location}</p>}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </a>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card/50 p-1.5 sm:p-2 lg:p-4 calendar-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={isMobile ? 'dayGridMonth' : view}
            key={isMobile ? 'mobile-month' : view}
            events={allEvents}
            eventClick={handleEventClick}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: '',
            }}
            height="auto"
            slotMinTime="08:00:00"
            slotMaxTime="21:00:00"
            allDaySlot={false}
            nowIndicator
            eventDisplay="block"
            eventBorderColor="transparent"
            dayHeaderClassNames="text-xs font-medium text-muted-foreground"
          />
        </div>
      )}

      {/* Legend */}
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
