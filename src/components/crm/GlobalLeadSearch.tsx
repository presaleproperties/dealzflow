import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Lofty-style global lead search.
 * - Slim trigger pill lives in the top nav.
 * - Click (or ⌘K / Ctrl+K) opens a centered modal palette with smooth transition.
 * - Searches name, email, phone. Click result -> /crm/leads/:id
 */
export function GlobalLeadSearch() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K to toggle, Esc handled inside the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll while open + autofocus
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
      };
    } else {
      // reset on close
      setQuery('');
      setActiveIdx(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = contacts.filter((c: any) => {
      const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      const phone = (c.phone ?? '').toLowerCase();
      const address = (c.property_address ?? c.address ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || address.includes(q);
    });
    return matches.slice(0, 12);
  }, [contacts, query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const handleSelect = (id: string) => {
    setOpen(false);
    navigate(`/crm/leads/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx].id); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <>
      {/* Trigger — icon-only search button (top-right) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search leads"
        title="Search (⌘K)"
        className="group relative flex items-center justify-center h-10 w-10 rounded-full bg-muted/40 hover:bg-muted/70 border border-border/50 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
      >
        <Search className="w-[18px] h-[18px] text-foreground/80 group-hover:text-foreground transition-colors" strokeWidth={2.2} />
      </button>

      {/* Modal overlay + centered palette */}
      <div
        className={cn(
          'fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4',
          'transition-opacity duration-200 ease-out',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

        {/* Panel — premium AI feel */}
        <div
          className={cn(
            'relative w-full max-w-[640px] rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-[0_20px_70px_-20px_rgba(0,0,0,0.5)] overflow-hidden',
            'transition-all duration-200 ease-out',
            open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'
          )}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-label="Search leads"
        >
          {/* Subtle AI gradient accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-[80%] rounded-full bg-primary/10 blur-3xl" />

          {/* Search input row */}
          <div className="relative flex items-center gap-3 px-6 h-16">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or search by name, phone, email…"
              className="flex-1 bg-transparent text-[16px] tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-light"
            />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close search"
              className="text-[10.5px] font-medium text-muted-foreground/60 hover:text-foreground/90 transition-colors px-2.5 py-1 rounded-md border border-border/40 hover:border-border/80"
            >
              esc
            </button>
          </div>

          {/* Divider with gradient fade */}
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

          {/* Results */}
          <div className="relative max-h-[60vh] overflow-y-auto">
            {!query.trim() ? (
              <div className="px-6 py-12 text-center">
                <div className="text-[12px] font-light tracking-wide text-muted-foreground/70 uppercase">
                  {contacts.length.toLocaleString()} leads ready
                </div>
                <div className="mt-2 text-[13px] text-muted-foreground/90">
                  Start typing to begin your search
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-[12.5px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-muted-foreground/80">
                No leads match <span className="text-foreground/90">"{query}"</span>
              </div>
            ) : (
              <ul className="py-2">
                {results.map((c: any, i) => {
                  const name = formatContactName(c.first_name, c.last_name) || 'Unnamed lead';
                  const subtitle = c.email || c.phone || '';
                  const tag = c.status || c.lead_type;
                  return (
                    <li key={c.id}>
                      <button
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => handleSelect(c.id)}
                        className={cn(
                          'w-full text-left px-6 py-3 flex items-center gap-3.5 transition-colors',
                          i === activeIdx ? 'bg-muted/60' : 'hover:bg-muted/30'
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center text-[11px] font-semibold flex-shrink-0 border border-primary/10">
                          {(c.first_name?.[0] ?? '').toUpperCase()}{(c.last_name?.[0] ?? '').toUpperCase() || '·'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium tracking-tight text-foreground truncate">{name}</div>
                          {subtitle && (
                            <div className="text-[11.5px] text-muted-foreground/80 truncate mt-0.5">{subtitle}</div>
                          )}
                        </div>
                        {tag && (
                          <span className="text-[9.5px] font-medium text-muted-foreground/70 uppercase tracking-[0.08em] flex-shrink-0">
                            {tag}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
