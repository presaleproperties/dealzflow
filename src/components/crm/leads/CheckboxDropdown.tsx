import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, X, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxDropdownProps {
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  allowCustom?: boolean;
  searchable?: boolean;
}

export function CheckboxDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  className,
  allowCustom = false,
  searchable = true,
}: CheckboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && (searchable || allowCustom)) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, searchable, allowCustom]);

  // Case-insensitive helpers — needed because legacy data may have selected
  // values with different casing/whitespace than the canonical option list.
  const isSelected = (val: string) =>
    selected.some(s => s.trim().toLowerCase() === val.trim().toLowerCase());

  const toggle = (val: string) => {
    if (isSelected(val)) {
      onChange(selected.filter(s => s.trim().toLowerCase() !== val.trim().toLowerCase()));
    } else {
      onChange([...selected, val]);
    }
  };

  const remove = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(s => s.trim().toLowerCase() !== val.trim().toLowerCase()));
  };

  // Combined options: known options + any selected custom values not in options.
  // Dedupe case-insensitively (preferring canonical option casing) so dirty
  // legacy values like "surrey" or "Surrey " never appear twice next to "Surrey".
  const allOptions = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach(o => {
      const key = o.trim().toLowerCase();
      if (key) map.set(key, o);
    });
    selected.forEach(s => {
      const trimmed = s.trim();
      const key = trimmed.toLowerCase();
      if (key && !map.has(key)) map.set(key, trimmed);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }, [options, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(o => o.toLowerCase().includes(q));
  }, [allOptions, query]);

  const exactMatch = useMemo(
    () => allOptions.some(o => o.toLowerCase() === query.trim().toLowerCase()),
    [allOptions, query]
  );

  const canCreate = allowCustom && query.trim().length > 0 && !exactMatch;

  const handleCreate = () => {
    const val = query.trim();
    if (!val) return;
    if (!isSelected(val)) onChange([...selected, val]);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canCreate) {
        handleCreate();
      } else if (filtered.length === 1) {
        toggle(filtered[0]);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between w-full min-h-11 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm font-medium transition-all duration-200 hover:border-border/80 hover:bg-muted/40',
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1 text-left">
          {selected.length === 0 ? (
            <span className="text-muted-foreground/60 text-sm py-0.5">{placeholder}</span>
          ) : (
            selected.map(val => (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium border border-primary/20"
              >
                {val}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => remove(val, e)}
                  className="hover:bg-primary/20 rounded p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform ml-1', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
          {(searchable || allowCustom) && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={allowCustom ? 'Search or add new…' : 'Search…'}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map(opt => {
              const isSelected = selected.includes(opt);
              const isCustom = !options.includes(opt as any);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { toggle(opt); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-border'
                  )}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-foreground flex-1">{opt}</span>
                  {isCustom && (
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">custom</span>
                  )}
                </button>
              );
            })}

            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/10 transition-colors text-left border-t border-border/40"
              >
                <Plus className="w-4 h-4 text-primary shrink-0" />
                <span className="text-foreground">
                  Add <span className="font-semibold text-primary">"{query.trim()}"</span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
