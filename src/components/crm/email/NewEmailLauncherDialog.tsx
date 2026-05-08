// NewEmailLauncherDialog
// ---------------------------------------------------------------------------
// "New Email" entry point used by surfaces that don't have a preselected
// recipient (currently /crm/email). Step 1 asks the agent to pick a lead via
// a Lofty-style command palette; once selected, it hands off to the same
// `<ComposeEmailDialog />` used by every other CRM surface, so the look,
// behaviour, drafts, templates, signature and send pipeline stay identical.
//
// This is the single source of truth for "blank-slate compose". If you need
// to add a new "New Email" CTA somewhere, mount this — never spin up a new
// composer.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, User, Mail as MailIcon, ArrowRight, Loader2 } from 'lucide-react';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { formatContactName } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewEmailLauncherDialog({ open, onOpenChange }: Props) {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [picked, setPicked] = useState<CrmContact | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // Defer reset so the close animation can finish before state churns.
      const t = setTimeout(() => {
        setQuery('');
        setActiveIdx(0);
        setPicked(null);
      }, 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withEmail = (contacts as CrmContact[]).filter((c) => !!c.email);
    if (!q) {
      return withEmail.slice(0, 12);
    }
    return withEmail
      .filter((c) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim().toLowerCase();
        return (
          name.includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 14);
  }, [contacts, query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const choose = (c: CrmContact) => {
    setPicked(c);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); choose(results[activeIdx]); }
  };

  // Once a lead is picked, hand off to the real composer. The launcher
  // dialog stays mounted but invisible so closing the composer brings the
  // agent back to the page (not back to the picker).
  if (picked) {
    return (
      <ComposeEmailDialog
        contact={picked}
        open
        onOpenChange={(next) => {
          if (!next) {
            setPicked(null);
            onOpenChange(false);
          }
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[640px] w-[96vw] p-0 overflow-hidden rounded-2xl border-border/60 bg-popover/95 backdrop-blur-xl shadow-[0_30px_80px_-20px_hsl(var(--foreground)/0.25)]"
      >
        <DialogTitle className="sr-only">Pick a lead to email</DialogTitle>

        {/* Header eyebrow */}
        <div className="px-5 pt-4 pb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
            New Email · Step 1 of 2
          </p>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground mt-0.5">
            Who are you emailing?
          </h2>
        </div>

        {/* Search row */}
        <div className="relative flex items-center gap-3 px-5 h-14 border-b border-border/60">
          <Search className="w-4 h-4 text-muted-foreground/70 shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search by name, email or phone…"
            className="flex-1 bg-transparent text-[14.5px] tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/70" />
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 h-5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
            ↵
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[58vh] overflow-y-auto">
          {!results.length ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center mb-2.5">
                <MailIcon className="w-4 h-4 text-muted-foreground/60" strokeWidth={1.8} />
              </div>
              <p className="text-[13px] text-foreground/90 font-light">
                {query.trim()
                  ? <>No leads match <span className="font-medium text-foreground">"{query}"</span></>
                  : 'No leads with an email on file yet.'}
              </p>
              <p className="text-[11.5px] text-muted-foreground/70 mt-1">
                Try a name, email, or phone number
              </p>
            </div>
          ) : (
            <>
              <div className="px-5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase">
                {query.trim() ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'Recent leads'}
              </div>
              <ul className="pb-2">
                {results.map((c, i) => {
                  const name = formatContactName(c.first_name, c.last_name) || 'Unnamed lead';
                  const isActive = i === activeIdx;
                  const tag = c.status || c.lead_type;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => choose(c)}
                        className={cn(
                          'group w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all',
                          isActive ? 'bg-muted/60' : 'hover:bg-muted/30',
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center text-[10.5px] font-semibold shrink-0 border',
                          isActive ? 'border-primary/40' : 'border-primary/10',
                        )}>
                          {(c.first_name?.[0] ?? c.email?.[0] ?? '?').toUpperCase()}
                          {(c.last_name?.[0] ?? '').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium tracking-tight text-foreground truncate">
                            {name}
                          </div>
                          <div className="text-[11px] text-muted-foreground/80 truncate flex items-center gap-1.5 mt-0.5">
                            <MailIcon className="w-3 h-3 shrink-0 text-muted-foreground/60" strokeWidth={2} />
                            <span className="truncate">{c.email}</span>
                          </div>
                        </div>
                        {tag && (
                          <span className="hidden sm:inline-flex text-[9.5px] font-medium text-muted-foreground/70 uppercase tracking-[0.08em] shrink-0">
                            {tag}
                          </span>
                        )}
                        <ArrowRight className={cn(
                          'w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-all',
                          isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1',
                        )} strokeWidth={2} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2.5 border-t border-border/60 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Pick a lead to open the composer</span>
          <span className="hidden sm:inline-flex items-center gap-1">
            <kbd className="px-1.5 h-4 rounded bg-card border border-border text-[9.5px] font-mono">↑↓</kbd>
            navigate
            <kbd className="ml-1.5 px-1.5 h-4 rounded bg-card border border-border text-[9.5px] font-mono">↵</kbd>
            select
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
