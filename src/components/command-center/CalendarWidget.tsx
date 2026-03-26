import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function CalendarWidget() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Use AGENDA mode on mobile for better readability (no text truncation)
  const mode = isMobile ? 'AGENDA' : 'WEEK';

  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <h2 className="text-sm font-semibold text-foreground">This Week's Schedule</h2>
      </div>
      <div className="relative flex-1" style={{ minHeight: '380px' }}>
        <iframe
          src={`https://calendar.google.com/calendar/embed?src=info%40meetuzair.com&ctz=America%2FVancouver&mode=${mode}&showTitle=0&showNav=1&showPrint=0&showCalendars=0&showTz=0&showTabs=0&showDate=1`}
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
      </div>
    </div>
  );
}
