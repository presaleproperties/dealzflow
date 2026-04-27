import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCrmProjects, type CrmProject } from '@/hooks/useCrmProjects';

interface Props {
  value: string;
  onChange: (name: string, project?: CrmProject) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Searchable picker backed by the unified crm_projects library.
 * Shows project name, city, and view popularity. Lets users type a brand-new
 * project name on the fly (it gets upserted on first use elsewhere).
 */
export function ProjectPicker({ value, onChange, placeholder = 'Select or type a project…', className, disabled }: Props) {
  const { data: projects = [], isLoading } = useCrmProjects();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects.slice(0, 50);
    return projects
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.developer ?? '').toLowerCase().includes(q) ||
        (p.aliases ?? []).some(a => a.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [projects, search]);

  const exactMatch = useMemo(
    () => projects.find(p => p.name.toLowerCase() === search.trim().toLowerCase()),
    [projects, search]
  );

  const selectedProject = projects.find(p => p.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            'w-full h-11 md:h-10 justify-between font-normal text-base md:text-sm',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate text-left">
            {value || placeholder}
            {selectedProject?.city && (
              <span className="ml-2 text-xs text-muted-foreground">· {selectedProject.city}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, city, developer…"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
          />
        </div>
        <ScrollArea className="max-h-72">
          {isLoading && <div className="px-3 py-4 text-xs text-muted-foreground">Loading projects…</div>}

          {!isLoading && filtered.length === 0 && !search.trim() && (
            <div className="px-3 py-4 text-xs text-muted-foreground">No projects yet.</div>
          )}

          {!isLoading && filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.name, p); setOpen(false); setSearch(''); }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors"
            >
              <Check className={cn('h-4 w-4 mt-0.5 shrink-0', value === p.name ? 'opacity-100' : 'opacity-0')} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{p.name}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {p.city && <span className="truncate">{p.city}</span>}
                  {p.status && <span className="truncate">· {p.status.replace(/_/g, ' ')}</span>}
                  {p.view_count > 0 && <span className="ml-auto shrink-0">{p.view_count} views</span>}
                </div>
              </div>
            </button>
          ))}

          {/* Allow typing a brand-new project name */}
          {!isLoading && search.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => { onChange(search.trim()); setOpen(false); setSearch(''); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors border-t border-border/60"
            >
              <span className="text-primary">+ Use</span>
              <span className="font-medium text-foreground">"{search.trim()}"</span>
              <span className="text-xs text-muted-foreground ml-auto">new project</span>
            </button>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
