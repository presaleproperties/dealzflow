import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Check, Plus, X } from 'lucide-react';
import { LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { cn } from '@/lib/utils';

type Props = {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
};

export function SourcePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Pull all distinct source values currently in use across the CRM
  const { data: dbSources = [] } = useQuery({
    queryKey: ['crm-distinct-sources'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('source')
        .not('source', 'is', null)
        .limit(5000);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => {
        const s = (r.source ?? '').trim();
        if (s) set.add(s);
      });
      return Array.from(set);
    },
  });

  const allOptions = useMemo(() => {
    const set = new Set<string>([...LEAD_SOURCES, ...dbSources]);
    if (value && value.trim()) set.add(value.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dbSources, value]);

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
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex-1 min-w-0 text-left text-sm px-2 py-1 rounded-md border border-transparent hover:border-border hover:bg-muted/40 transition-colors truncate',
              !value && 'text-muted-foreground',
            )}
          >
            {value || 'Set source…'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or add new…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No matches</CommandEmpty>
              <CommandGroup>
                {filtered.map(opt => (
                  <CommandItem key={opt} value={opt} onSelect={() => select(opt)}>
                    <Check className={cn('w-3.5 h-3.5 mr-2', value === opt ? 'opacity-100' : 'opacity-0')} />
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => select(null)}
          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
          title="Clear source"
          aria-label="Clear source"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
