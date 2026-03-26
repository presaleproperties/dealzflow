import { useState } from 'react';
import { useTheme } from 'next-themes';
import { format, addWeeks, subWeeks } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ViewMode = 'WEEK' | 'AGENDA' | 'MONTH';

const VIEW_LABELS: Record<ViewMode, string> = {
  WEEK: 'Week',
  AGENDA: 'Agenda',
  MONTH: 'Month',
};

export function CalendarWidget() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [viewMode, setViewMode] = useState<ViewMode>('WEEK');
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Build the Google Calendar embed URL
  const dateStr = format(selectedDate, 'yyyyMMdd');
  const src = `https://calendar.google.com/calendar/embed?src=info%40meetuzair.com&ctz=America%2FVancouver&mode=${viewMode}&showTitle=0&showNav=0&showPrint=0&showCalendars=0&showTz=0&showTabs=0&showDate=0&dates=${dateStr}%2F${dateStr}`;

  const goBack = () => setSelectedDate(prev => subWeeks(prev, 1));
  const goForward = () => setSelectedDate(prev => addWeeks(prev, 1));
  const goToday = () => setSelectedDate(new Date());

  return (
    <div className={cn(
      'rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col transition-all duration-300',
      expanded ? 'h-[600px]' : 'h-full',
    )}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 shrink-0">
        {/* Date picker trigger */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-muted/40 rounded-lg px-2 py-1 transition-colors -ml-1">
              <CalendarIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {format(selectedDate, 'MMM d, yyyy')}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Navigation arrows */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goBack}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="text-[10px] font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-colors"
          >
            Today
          </button>
          <button
            onClick={goForward}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border/50 mx-1" />

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
          {(['AGENDA', 'WEEK', 'MONTH'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-all duration-200',
                viewMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* Open in Google Calendar */}
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          title="Open in Google Calendar"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ── Calendar iframe ───────────────────────────────────── */}
      <motion.div
        className="relative flex-1"
        layout
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <iframe
          key={`${viewMode}-${dateStr}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          title="Google Calendar"
          style={{
            filter: isDark
              ? 'invert(0.88) hue-rotate(180deg) saturate(0.9) brightness(0.95)'
              : 'none',
            transition: 'filter 0.3s ease',
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </motion.div>
    </div>
  );
}
