import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({ label, options, selected, onChange, className }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 h-9 px-3 rounded-lg border text-xs font-medium transition-colors w-full justify-between min-h-[44px] sm:min-h-0',
          selected.length > 0
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'border-border/60 bg-muted/30 text-muted-foreground hover:border-border/80'
        )}
      >
        <span className="truncate">
          {selected.length > 0 ? `${label} (${selected.length})` : label}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-64 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg py-1 left-0">
          {/* Select All / Clear */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
            <button onClick={selectAll} className="text-[11px] text-primary hover:underline">Select All</button>
            <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
          </div>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors min-h-[36px]"
            >
              <div className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                selected.includes(opt) ? 'bg-primary border-primary' : 'border-border'
              )}>
                {selected.includes(opt) && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span className="truncate">{opt}</span>
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No options</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Active filter pills display */
export function ActiveFilterPills({
  filters,
  onClear,
  onClearAll,
}: {
  filters: { key: string; label: string; values: string[] }[];
  onClear: (key: string) => void;
  onClearAll: () => void;
}) {
  const active = filters.filter(f => f.values.length > 0);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {active.map(f => (
        <Badge key={f.key} variant="secondary" className="gap-1 text-xs cursor-pointer pr-1.5" onClick={() => onClear(f.key)}>
          {f.label}: {f.values.length > 2 ? `${f.values.slice(0, 2).join(', ')} +${f.values.length - 2}` : f.values.join(', ')}
          <X className="w-3 h-3" />
        </Badge>
      ))}
      <button onClick={onClearAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Clear all
      </button>
    </div>
  );
}
