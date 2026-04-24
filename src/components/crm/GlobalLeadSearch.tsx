import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, Sparkles } from 'lucide-react';
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
      return name.includes(q) || email.includes(q) || phone.includes(q);
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
      {/* Trigger pill — premium AI-feel, no icons */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search leads"
        className="group relative flex items-center h-10 w-[280px] lg:w-[440px] px-5 rounded-full bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30 hover:from-muted/50 hover:via-muted/40 hover:to-muted/50 border border-border/40 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <span className="text-[13px] font-medium tracking-tight text-muted-foreground/90 group-hover:text-foreground/90 flex-1 truncate transition-colors">
          Ask anything or search leads…
        </span>
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

        {/* Panel */}
        <div
          className={cn(
            'relative w-full max-w-[640px] rounded-2xl border border-border/60 bg-popover shadow-2xl overflow-hidden',
            'transition-all duration-200 ease-out',
            open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]'
          )}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-label="Search leads"
        >
          {/* Search input row — clean, no icons */}
          <div className="flex items-center gap-3 px-5 h-14 border-b border-border/50">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or search by name, phone, email…"
              className="flex-1 bg-transparent text-[15px] tracking-tight text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <button
              onClick={() => setOpen(false)}
              aria-label="Close search"
              className="text-[11px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors px-2 py-0.5 rounded"
            >
              esc
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {!query.trim() ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                Start typing to search across {contacts.length.toLocaleString()} leads.
              </div>
            ) : isLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading leads…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                No leads match “{query}”.
              </div>
            ) : (
              <ul className="py-1.5">
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
                          'w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors',
                          i === activeIdx ? 'bg-muted/70' : 'hover:bg-muted/40'
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                          {(c.first_name?.[0] ?? '').toUpperCase()}{(c.last_name?.[0] ?? '').toUpperCase() || '·'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-foreground truncate">{name}</div>
                          {subtitle && (
                            <div className="text-[11.5px] text-muted-foreground truncate">{subtitle}</div>
                          )}
                        </div>
                        {tag && (
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">
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

          {/* Footer hints */}
          <div className="flex items-center justify-between px-4 h-9 border-t border-border/50 text-[10.5px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="px-1.5 h-4 rounded bg-muted/60 border border-border/50">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 h-4 rounded bg-muted/60 border border-border/50">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="px-1.5 h-4 rounded bg-muted/60 border border-border/50">esc</kbd> close</span>
            </div>
            <span>{results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}
