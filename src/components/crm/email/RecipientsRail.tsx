// RecipientsRail — right pane of the email workspace.
// Searchable lead list with segment chips (sourced from crm_lead_segments,
// matching the Pipeline + Leads page) and multi-select for mass send.

import { useMemo, useState } from 'react';
import { Search, Users, X, Check, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { useCrmLeadSegments, type LeadSegment } from '@/hooks/useCrmLeadSegments';
import { matchesSegment } from '@/lib/segmentMatching';
import { formatContactName } from '@/lib/format';

interface Props {
  selected: CrmContact[];
  onSelectedChange: (next: CrmContact[]) => void;
}

export function RecipientsRail({ selected, onSelectedChange }: Props) {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const { data: segments = [] } = useCrmLeadSegments();
  const [search, setSearch] = useState('');
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const activeSegment: LeadSegment | undefined = useMemo(
    () => segments.find((s) => s.id === activeSegmentId),
    [segments, activeSegmentId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (onlyWithEmail && !c.email) return false;
      if (q) {
        const name = formatContactName(c).toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        const phone = (c.phone ?? '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
      }
      if (activeSegment && Object.keys(activeSegment.filter_config).length > 0) {
        if (!matchesSegment(c, activeSegment.filter_config)) return false;
      }
      return true;
    });
  }, [contacts, search, onlyWithEmail, activeSegment]);

  const toggle = (c: CrmContact) => {
    if (selectedIds.has(c.id)) {
      onSelectedChange(selected.filter((s) => s.id !== c.id));
    } else {
      onSelectedChange([...selected, c]);
    }
  };

  const selectAllVisible = () => {
    const visibleIds = new Set(filtered.map((c) => c.id));
    const others = selected.filter((s) => !visibleIds.has(s.id));
    onSelectedChange([...others, ...filtered]);
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  return (
    <aside className="flex flex-col h-full min-h-0 border-l border-border bg-muted/5">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Recipients</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : `${filtered.length} of ${contacts.length}`}
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Segment chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          <button
            type="button"
            onClick={() => setActiveSegmentId(null)}
            className={cn(
              'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium border transition-colors',
              !activeSegmentId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/60',
            )}
          >
            All
          </button>
          {segments
            .filter((s) => Object.keys(s.filter_config).length > 0)
            .slice(0, 10)
            .map((seg) => {
              const isActive = activeSegmentId === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setActiveSegmentId(isActive ? null : seg.id)}
                  className={cn(
                    'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium border transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/60',
                  )}
                  title={seg.name}
                >
                  {seg.emoji && <span>{seg.emoji}</span>}
                  <span className="truncate max-w-[90px]">{seg.name.replace(/🔥|🏢|🛒|🔍|💬|🔒|❄️/g, '').trim()}</span>
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between mt-2 gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithEmail}
              onChange={(e) => setOnlyWithEmail(e.target.checked)}
              className="rounded border-border h-3 w-3"
            />
            Only leads with email
          </label>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-[10px] uppercase tracking-wider text-primary hover:underline"
            >
              {allVisibleSelected ? 'Deselect all' : `Select all (${filtered.length.toLocaleString()})`}
            </button>
          )}
        </div>
      </div>

      {/* Selected summary bar */}
      {selected.length > 0 && (
        <div className="px-3.5 py-2 border-b border-border bg-primary/5 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] font-medium text-foreground">
            {selected.length.toLocaleString()} recipient{selected.length === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            onClick={() => onSelectedChange([])}
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground text-center py-6">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-6 px-3">
            <Filter className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/40" />
            No leads match your filters
          </div>
        ) : (
          filtered.slice(0, 500).map((c) => {
            const isSel = selectedIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-3 py-2 border-b border-border/40 transition-colors',
                  isSel ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40',
                )}
              >
                <div className={cn(
                  'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                  isSel ? 'bg-primary border-primary' : 'border-border bg-background',
                )}>
                  {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">
                    {formatContactName(c)}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground truncate leading-tight">
                    {c.email ?? <span className="text-amber-600">No email</span>}
                  </p>
                </div>
                {c.status && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 uppercase tracking-wider">
                    {c.status.split(' ')[0]}
                  </Badge>
                )}
              </button>
            );
          })
        )}
        {filtered.length > 500 && (
          <div className="text-[11px] text-muted-foreground text-center py-3 border-t border-border/40">
            Showing first 500 of {filtered.length.toLocaleString()} — narrow your filter to see more
          </div>
        )}
      </div>
    </aside>
  );
}
