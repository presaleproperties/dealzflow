import { useMemo, useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LibraryItem {
  label: string;
  count: number;
}

interface LibraryMultiSelectCardProps {
  title: string;
  selected: string[];
  library: LibraryItem[];
  /** Called with the new full array (after add/remove). */
  onChange: (next: string[]) => void;
  /** Called when a brand-new value is created (so caller can persist to library). */
  onCreate?: (name: string) => void;
  /** How to render each chip's label (e.g. for label maps). */
  renderLabel?: (value: string) => string;
  /** Color theme (CSS color string, defaults to primary). */
  accentColor?: string;
  emptyHint?: string;
  placeholder?: string;
  /** Set to false to lock down the create-new option; users can only pick from library. */
  allowCreate?: boolean;
}

export function LibraryMultiSelectCard({
  title,
  selected,
  library,
  onChange,
  onCreate,
  renderLabel,
  accentColor,
  emptyHint = 'None — add one',
  placeholder = 'Search or create...',
  allowCreate = true,
}: LibraryMultiSelectCardProps) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedLower = useMemo(() => new Set(selected.map(t => t.toLowerCase())), [selected]);

  const suggestions = useMemo(() => {
    const list = library.filter(t => !selectedLower.has(t.label.toLowerCase()));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q));
  }, [library, selectedLower, query]);

  useEffect(() => {
    if (!adding) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAdding(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [adding]);

  const addItem = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (selectedLower.has(value.toLowerCase())) {
      setQuery('');
      return;
    }
    onChange([...selected, value]);
    const exists = library.some(t => t.label.toLowerCase() === value.toLowerCase());
    if (!exists && onCreate) onCreate(value);
    setQuery('');
  };

  const removeItem = (value: string) => {
    onChange(selected.filter(t => t !== value));
  };

  const queryMatchesExisting = useMemo(
    () => library.some(t => t.label.toLowerCase() === query.trim().toLowerCase()),
    [library, query],
  );
  const showCreateOption = allowCreate && query.trim().length > 0 && !queryMatchesExisting && !selectedLower.has(query.trim().toLowerCase());

  const chipBg = accentColor ? `${accentColor} / 0.15` : 'hsl(var(--primary) / 0.15)';
  const chipFg = accentColor ?? 'hsl(var(--primary))';

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAdding(v => !v)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {selected.map(value => (
          <Badge
            key={value}
            className="border-0 text-[11px] font-semibold gap-1 pr-1.5 cursor-default"
            style={{ background: chipBg, color: chipFg }}
          >
            {renderLabel ? renderLabel(value) : value}
            <button
              type="button"
              onClick={() => removeItem(value)}
              className="hover:opacity-70 transition-opacity"
              aria-label={`Remove ${value}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        {selected.length === 0 && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {emptyHint}
          </button>
        )}
      </div>

      {adding && (
        <div ref={popoverRef} className="mt-3 border border-border rounded-lg bg-popover shadow-lg overflow-hidden">
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

          <div className="max-h-64 overflow-y-auto">
            {showCreateOption && (
              <button
                onClick={() => addItem(query)}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors border-b border-border/30 bg-primary/5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  Add new <span className="font-semibold">"{query.trim()}"</span>
                </span>
              </button>
            )}

            {suggestions.length === 0 && !showCreateOption && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {query ? 'No matches' : (allowCreate ? 'Type to create' : 'No options available')}
              </div>
            )}

            {suggestions.map(item => (
              <button
                key={item.label}
                onClick={() => addItem(item.label)}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors',
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  <Check className="w-3 h-3 opacity-0" />
                  <span className="truncate text-foreground">
                    {renderLabel ? renderLabel(item.label) : item.label}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground bg-muted/20 flex items-center justify-between">
            <span>Enter to add · Esc to close</span>
            <span className="tabular-nums">{suggestions.length} {query ? 'matching' : 'available'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
