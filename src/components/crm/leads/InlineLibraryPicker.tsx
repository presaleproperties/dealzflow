import { useMemo, useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

export interface LibraryItem {
  label: string;
  count: number;
}

interface InlineLibraryPickerProps {
  /** Currently selected values on the entity. */
  selected: string[];
  /** Full canonical library (sorted however the caller wants). */
  library: LibraryItem[];
  onChange: (next: string[]) => void;
  onCreate?: (name: string) => void;
  /** Render label (for label maps like LEAD_TYPE_LABELS). */
  renderLabel?: (value: string) => string;
  /** Locks down free-form creation. */
  allowCreate?: boolean;
  emptyText?: string;
  placeholder?: string;
  /** Visual variant: 'subtle' for sidebar (uses muted bg), 'primary' for emphasized chips. */
  variant?: 'subtle' | 'primary';
}

/**
 * Slim inline multi-select with autocomplete from a unified library.
 * Designed to drop into the lead-detail sidebar's compact section style.
 */
export function InlineLibraryPicker({
  selected,
  library,
  onChange,
  onCreate,
  renderLabel,
  allowCreate = true,
  emptyText = 'None yet',
  placeholder = 'Search or add…',
  variant = 'subtle',
}: InlineLibraryPickerProps) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedLower = useMemo(
    () => new Set(selected.map(t => t.toLowerCase())),
    [selected],
  );

  const suggestions = useMemo(() => {
    const list = library.filter(t => !selectedLower.has(t.label.toLowerCase()));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q));
  }, [library, selectedLower, query]);

  useEffect(() => {
    if (!adding) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAdding(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  const addItem = (raw: string) => {
    const v = raw.trim();
    if (!v || selectedLower.has(v.toLowerCase())) {
      setQuery('');
      return;
    }
    onChange([...selected, v]);
    const exists = library.some(t => t.label.toLowerCase() === v.toLowerCase());
    if (!exists && onCreate) onCreate(v);
    setQuery('');
  };

  const removeItem = (v: string) => onChange(selected.filter(t => t !== v));

  const queryMatchesExisting = useMemo(
    () => library.some(t => t.label.toLowerCase() === query.trim().toLowerCase()),
    [library, query],
  );
  const showCreateOption =
    allowCreate &&
    query.trim().length > 0 &&
    !queryMatchesExisting &&
    !selectedLower.has(query.trim().toLowerCase());

  const chipClass =
    variant === 'primary'
      ? 'text-[11px] font-semibold gap-1 pr-1.5 py-0.5 border-0'
      : 'text-[11px] font-medium gap-1 pr-1.5 py-0.5 border-border/70 bg-muted/40 text-foreground';
  const chipStyle =
    variant === 'primary'
      ? { background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }
      : undefined;

  return (
    <div ref={wrapRef} className="relative space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {selected.length === 0 && !adding && (
          <span className="text-xs text-muted-foreground/70">{emptyText}</span>
        )}
        {selected.map(v => (
          <Badge
            key={v}
            variant="outline"
            className={chipClass}
            style={chipStyle}
          >
            {renderLabel ? renderLabel(v) : v}
            <button
              type="button"
              onClick={() => removeItem(v)}
              className="hover:opacity-70 transition-opacity"
              aria-label={`Remove ${v}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-dashed border-border/60 hover:border-border"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        )}
      </div>

      {adding && (
        <div className="border border-border rounded-lg bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border/40">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-2"
              maxLength={80}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestions.length > 0 && !showCreateOption) {
                    addItem(suggestions[0].label);
                  } else if (allowCreate && query.trim()) {
                    addItem(query);
                  }
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setQuery('');
                }
              }}
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {showCreateOption && (
              <button
                onClick={() => addItem(query)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border-b border-border/30 bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  Add new <span className="font-semibold">"{query.trim()}"</span>
                </span>
              </button>
            )}

            {suggestions.length === 0 && !showCreateOption && (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                {query ? 'No matches' : (allowCreate ? 'Type to create' : 'No options')}
              </div>
            )}

            {suggestions.slice(0, 50).map(item => (
              <button
                key={item.label}
                onClick={() => addItem(item.label)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors"
              >
                <span className="truncate text-foreground">
                  {renderLabel ? renderLabel(item.label) : item.label}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground bg-muted/20 flex items-center justify-between">
            <span>Enter · Esc to close</span>
            <span className="tabular-nums">
              {suggestions.length} {query ? 'matching' : 'available'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
