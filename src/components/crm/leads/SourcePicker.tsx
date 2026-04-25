import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Check, Plus, X } from 'lucide-react';
import { LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { useCrmSources } from '@/hooks/useCrmSources';
import { cn } from '@/lib/utils';

type Props = {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
};

export function SourcePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Unified library — auto-synced from every contact's source via Postgres trigger.
  const { data: librarySources = [] } = useCrmSources();

  const allOptions = useMemo(() => {
    const set = new Set<string>([
      ...LEAD_SOURCES,
      ...librarySources.map(s => s.name),
    ]);
    if (value && value.trim()) set.add(value.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [librarySources, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(o => o.toLowerCase().includes(q));
  }, [allOptions, search]);

  const exactMatch = useMemo(
    () => allOptions.some(o => o.toLowerCase() === search.trim().toLowerCase()),
    [allOptions, search],
  );

  const select = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'text-[13px] text-right truncate max-w-full hover:text-primary transition-colors',
            !value && 'text-muted-foreground/70',
          )}
        >
          {value || 'Set source…'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or add new…"
            value={search}
            onValueChange={setSearch}
          />
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-muted/30">
            {filtered.length} {filtered.length === 1 ? 'source' : 'sources'}
            {search.trim() ? ` matching "${search.trim()}"` : ' available'}
          </div>
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem key={opt} value={opt} onSelect={() => select(opt)}>
                  <Check className={cn('w-3.5 h-3.5 mr-2 shrink-0', value === opt ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && !exactMatch && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => select(search.trim())}>
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    Add "{search.trim()}"
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            {value && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => select(null)} className="text-muted-foreground">
                    <X className="w-3.5 h-3.5 mr-2" />
                    Clear source
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
