import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EMAIL_VARIABLES, EMAIL_VARIABLE_GROUPS } from '@/lib/emailVariables';
import { toast } from 'sonner';

interface Props {
  /** Called with the token wrapped in {{ }} so the caller can insert it where they want. */
  onInsert: (snippet: string) => void;
}

export function VariablePicker({ onInsert }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return EMAIL_VARIABLES;
    return EMAIL_VARIABLES.filter(v =>
      v.token.toLowerCase().includes(needle) ||
      v.label.toLowerCase().includes(needle) ||
      v.group.toLowerCase().includes(needle),
    );
  }, [q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof EMAIL_VARIABLES>();
    for (const v of filtered) {
      const arr = map.get(v.group) ?? [];
      arr.push(v);
      map.set(v.group, arr);
    }
    return EMAIL_VARIABLE_GROUPS
      .map(g => ({ group: g, items: map.get(g) ?? [] }))
      .filter(g => g.items.length > 0);
  }, [filtered]);

  const insert = (token: string) => {
    onInsert(`{{${token}}}`);
    navigator.clipboard?.writeText(`{{${token}}}`).catch(() => {});
    toast.success(`Inserted {{${token}}}`);
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Variables
        </h3>
        <span className="text-[10px] text-muted-foreground">{EMAIL_VARIABLES.length} available</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search variables…"
          className="pl-8 h-8 text-xs"
        />
      </div>

      <ScrollArea className="h-[300px] pr-2">
        <div className="space-y-3">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{group}</p>
              <div className="space-y-1">
                {items.map(v => (
                  <button
                    key={v.token}
                    onClick={() => insert(v.token)}
                    className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{v.label}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{`{{${v.token}}}`}</p>
                    </div>
                    <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No variables match.</p>
          )}
        </div>
      </ScrollArea>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Click any variable to insert it. Tokens like <Badge variant="secondary" className="text-[10px] mx-0.5 font-mono">{'{{lead.first_name}}'}</Badge> are replaced with each recipient’s data when the email is sent.
      </p>
    </div>
  );
}
