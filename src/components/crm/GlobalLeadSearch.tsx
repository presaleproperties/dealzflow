import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { cn } from '@/lib/utils';

export function GlobalLeadSearch() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = contacts.filter((c: any) => {
      const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      const phone = (c.phone ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
    return matches.slice(0, 8);
  }, [contacts, query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const handleSelect = (id: string) => {
    setOpen(false);
    setQuery('');
    navigate(`/crm/leads/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx].id); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-[320px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search leads…"
        className="w-full h-8 pl-8 pr-12 rounded-lg bg-muted/40 border border-border/60 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:bg-background transition-colors"
      />
      {query ? (
        <button
          onClick={() => { setQuery(''); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <kbd className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 h-4 rounded text-[9.5px] font-semibold text-muted-foreground/70 bg-background/60 border border-border/50">
          ⌘K
        </kbd>
      )}

      {open && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-border/60 bg-popover shadow-2xl overflow-hidden z-50">
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading leads…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">No leads found.</div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto py-1">
              {results.map((c: any, i) => {
                const name = formatContactName(c) || 'Unnamed lead';
                const subtitle = c.email || c.phone || c.status || '';
                return (
                  <li key={c.id}>
                    <button
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => handleSelect(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors',
                        i === activeIdx ? 'bg-muted/70' : 'hover:bg-muted/40'
                      )}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10.5px] font-bold flex-shrink-0">
                        {(c.first_name?.[0] ?? '').toUpperCase()}{(c.last_name?.[0] ?? '').toUpperCase() || '·'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-foreground truncate">{name}</div>
                        {subtitle && (
                          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
                        )}
                      </div>
                      {c.status && (
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">
                          {c.status}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
