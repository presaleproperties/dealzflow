import { useState, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmShowings, useUpdateShowingStatus } from '@/hooks/useCrmShowings';
import { AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { BookShowingModal } from '@/components/crm/calendar/BookShowingModal';
import { ShowingDetailModal } from '@/components/crm/calendar/ShowingDetailModal';
import type { CrmShowingWithContact } from '@/hooks/useCrmShowings';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'hsl(39 90% 50%)',
  completed: 'hsl(142 60% 45%)',
  cancelled: 'hsl(220 10% 60%)',
  'no-show': 'hsl(0 70% 55%)',
};

export default function CrmCalendarPage() {
  const { data: showings, isLoading } = useCrmShowings();
  const updateStatus = useUpdateShowingStatus();

  const [view, setView] = useState<'timeGridWeek' | 'dayGridMonth'>('timeGridWeek');
  const [agentFilter, setAgentFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [bookOpen, setBookOpen] = useState(false);
  const [detailShowing, setDetailShowing] = useState<CrmShowingWithContact | null>(null);

  const events = useMemo(() => {
    if (!showings) return [];
    return showings
      .filter(s => agentFilter === 'all' || s.assigned_agent === agentFilter)
      .filter(s => projectFilter === 'all' || s.project === projectFilter)
      .map(s => {
        const name = s.crm_contacts ? `${s.crm_contacts.first_name} ${s.crm_contacts.last_name}` : 'Unknown';
        const status = s.status ?? 'confirmed';
        return {
          id: s.id,
          title: `${name} — ${s.project}`,
          start: `${s.showing_date}T${s.showing_time}`,
          backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.confirmed,
          borderColor: 'transparent',
          extendedProps: { showing: s },
        };
      });
  }, [showings, agentFilter, projectFilter]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const s = info.event.extendedProps.showing as CrmShowingWithContact;
    setDetailShowing(s);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Showings Calendar</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={view} onValueChange={v => setView(v as 'timeGridWeek' | 'dayGridMonth')}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="timeGridWeek">Week</SelectItem>
              <SelectItem value="dayGridMonth">Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setBookOpen(true)} className="gap-1.5 h-9">
            <Plus className="h-4 w-4" /> Book Showing
          </Button>
        </div>
      </div>

      {/* Calendar */}
      {isLoading ? (
        <div className="h-[600px] rounded-xl bg-muted/30 animate-pulse" />
      ) : (
        <div className="rounded-xl border border-border/50 bg-card/50 p-2 sm:p-4 calendar-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            key={view}
            events={events}
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
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
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
