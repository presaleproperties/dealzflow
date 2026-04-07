import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function getInitials(first: string, last: string) {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase();
}

export default function CrmContactsPage() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    let list = [...contacts].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, search]);

  const jumpTo = (letter: string) => {
    const el = listRef.current?.querySelector(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Group by first letter of last_name for anchors
  const letterSet = useMemo(() => new Set(sorted.map(c => (c.last_name?.[0] ?? '').toUpperCase())), [sorted]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-foreground">Contacts</h1>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..." className="pl-9 h-9 text-sm" />
        </div>
      </div>

      {/* Alphabet bar */}
      <div className="flex flex-wrap gap-0.5 mb-4">
        {ALPHA.map(l => (
          <button
            key={l}
            onClick={() => jumpTo(l)}
            className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${letterSet.has(l) ? 'text-foreground hover:bg-primary/10' : 'text-muted-foreground/40 cursor-default'}`}
            disabled={!letterSet.has(l)}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No contacts found.</p>
      ) : (
        <div ref={listRef} className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-12" />
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Project</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastLetter = '';
                return sorted.map(c => {
                  const letter = (c.last_name?.[0] ?? '').toUpperCase();
                  const showAnchor = letter !== lastLetter;
                  lastLetter = letter;
                  const tags = (c.tags ?? []) as string[];
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                      {...(showAnchor ? { 'data-letter': letter } : {})}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold flex-shrink-0" style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
                          {getInitials(c.first_name, c.last_name)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link to={`/crm/leads/${c.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                          {c.first_name} {c.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {c.phone ? <a href={`tel:${c.phone}`} className="text-sm text-primary hover:underline">{c.phone}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {c.email ? <a href={`mailto:${c.email}`} className="text-sm text-primary hover:underline truncate block max-w-[180px]">{c.email}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {c.project ? (
                          <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                            {c.project}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <LeadStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
