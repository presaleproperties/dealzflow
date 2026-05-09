import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineKind } from '@/hooks/useLeadTimelineV2';

const FILTERS: { key: 'all' | TimelineKind | 'comms'; label: string; kinds: TimelineKind[] | null }[] = [
  { key: 'all', label: 'All', kinds: null },
  { key: 'comms', label: 'Comms', kinds: ['email', 'sms', 'note'] },
  { key: 'behavior', label: 'Behavior', kinds: ['behavior', 'engagement', 'form'] },
  { key: 'task', label: 'Tasks', kinds: ['task'] },
  { key: 'showing', label: 'Showings', kinds: ['showing', 'booking'] },
];

interface Props {
  active: 'all' | TimelineKind | 'comms';
  onChange: (filterKey: 'all' | TimelineKind | 'comms', kinds: TimelineKind[] | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function TimelineFilters({ active, onChange, search, onSearchChange }: Props) {
  const [draft, setDraft] = useState(search);
  const debRef = useRef<number | null>(null);
  useEffect(() => {
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => onSearchChange(draft.trim()), 250);
    return () => {
      if (debRef.current) window.clearTimeout(debRef.current);
    };
  }, [draft, onSearchChange]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search timeline…"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-[12.5px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {draft && (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key, f.kinds)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
              active === f.key
                ? 'bg-foreground text-background'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
