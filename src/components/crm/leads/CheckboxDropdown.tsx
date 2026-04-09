import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxDropdownProps {
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function CheckboxDropdown({ options, selected, onChange, placeholder = 'Select...', className }: CheckboxDropdownProps) {
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
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  };

  const display = selected.length > 0 ? selected.join(', ') : placeholder;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full h-11 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:border-border/80 hover:bg-muted/40"
      >
        <span className={cn('truncate text-left', selected.length === 0 && 'text-muted-foreground/40')}>
          {display}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto animate-fade-in">
          {options.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? 'bg-primary border-primary' : 'border-border'
                )}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className="text-foreground">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
