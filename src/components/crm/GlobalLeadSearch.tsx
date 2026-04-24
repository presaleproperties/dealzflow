import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Sparkles, User, Mail, Phone, MapPin, ArrowRight } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Highlight matched substring within text */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm px-0.5 font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

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
    const matches = contacts
      .map((c: any) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const email = c.email ?? '';
        const phone = c.phone ?? '';
        const address = c.property_address ?? c.address ?? '';
        const matchedField = name.toLowerCase().includes(q) ? 'name'
          : email.toLowerCase().includes(q) ? 'email'
          : phone.toLowerCase().includes(q) ? 'phone'
          : address.toLowerCase().includes(q) ? 'address'
          : null;
        return matchedField ? { c, matchedField, name, email, phone, address } : null;
      })
      .filter(Boolean) as Array<{ c: any; matchedField: string; name: string; email: string; phone: string; address: string }>;
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
    else if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx].c.id); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <>
      {/* Trigger — search pill (top-right) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Search leads"
        title="Search (⌘K)"
        className="group flex items-center gap-2.5 h-10 w-[280px] px-3.5 rounded-full bg-muted/40 hover:bg-muted/70 border border-border/50 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-left"
      >
        <Search className="w-[16px] h-[16px] text-muted-foreground/80 group-hover:text-foreground flex-shrink-0 transition-colors" strokeWidth={2.2} />
        <span className="flex-1 text-[13px] font-light text-muted-foreground/70 group-hover:text-foreground/80 truncate transition-colors">
          Search leads…
        </span>
        <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/60 px-1.5 py-0.5 rounded border border-border/40 flex-shrink-0">
          ⌘K
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
            <Search className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by name, phone, email, or property address…"
              className="flex-1 bg-transparent text-[16px] tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-light"
            />
            {isLoading && query.trim() && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/70" />
            )}
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
              <div className="px-6 py-8 text-[13px] text-muted-foreground/70 font-light">
                Start typing to search across <span className="text-foreground font-medium">{contacts.length.toLocaleString()}</span> leads.
              </div>
            ) : isLoading ? (
              <div className="px-6 py-10 space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3.5 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-muted/60" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-1/3 rounded bg-muted/60" />
                      <div className="h-2.5 w-1/2 rounded bg-muted/40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                  <Search className="w-4 h-4 text-muted-foreground/60" strokeWidth={1.8} />
                </div>
                <div className="text-[13.5px] text-foreground/90 font-light">
                  No leads match <span className="text-foreground font-medium">"{query}"</span>
                </div>
                <div className="text-[12px] text-muted-foreground/70 mt-1.5">
                  Try a name, phone, email, or property address
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 pt-3 pb-1.5 flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">
                  <Sparkles className="w-3 h-3 text-primary/80" strokeWidth={2.2} />
                  {results.length} result{results.length === 1 ? '' : 's'}
                </div>
                <ul className="pb-2">
                  {results.map((r, i) => {
                    const { c, matchedField, name: rawName, email, phone, address } = r;
                    const name = formatContactName(c.first_name, c.last_name) || 'Unnamed lead';
                    const tag = c.status || c.lead_type;
                    const FieldIcon = matchedField === 'email' ? Mail
                      : matchedField === 'phone' ? Phone
                      : matchedField === 'address' ? MapPin
                      : User;
                    const subtitleValue = matchedField === 'email' ? email
                      : matchedField === 'phone' ? phone
                      : matchedField === 'address' ? address
                      : (email || phone || '');
                    const isActive = i === activeIdx;
                    return (
                      <li key={c.id}>
                        <button
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => handleSelect(c.id)}
                          className={cn(
                            'group w-full text-left px-6 py-3 flex items-center gap-3.5 transition-all',
                            isActive ? 'bg-muted/60' : 'hover:bg-muted/30'
                          )}
                        >
                          <div className={cn(
                            'w-9 h-9 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center text-[11px] font-semibold flex-shrink-0 border transition-colors',
                            isActive ? 'border-primary/40' : 'border-primary/10'
                          )}>
                            {(c.first_name?.[0] ?? '').toUpperCase()}{(c.last_name?.[0] ?? '').toUpperCase() || '·'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium tracking-tight text-foreground truncate">
                              {matchedField === 'name'
                                ? <Highlight text={rawName || name} query={query} />
                                : name}
                            </div>
                            {subtitleValue && (
                              <div className="text-[11.5px] text-muted-foreground/80 truncate mt-0.5 flex items-center gap-1.5">
                                <FieldIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground/60" strokeWidth={2} />
                                <span className="truncate">
                                  {matchedField !== 'name'
                                    ? <Highlight text={subtitleValue} query={query} />
                                    : subtitleValue}
                                </span>
                              </div>
                            )}
                          </div>
                          {tag && (
                            <span className="text-[9.5px] font-medium text-muted-foreground/70 uppercase tracking-[0.08em] flex-shrink-0">
                              {tag}
                            </span>
                          )}
                          <ArrowRight className={cn(
                            'w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 transition-all',
                            isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
                          )} strokeWidth={2} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
