// TemplatesRail — left pane of the email workspace. Searchable, tag-filterable
// template library merged from local CRM templates + Presale bridge templates.
// Click a card → applies to the live composer.

import { useMemo, useState } from 'react';
import { Search, Sparkles, FileText, Tag, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { TemplateThumb } from '@/components/crm/email/TemplateThumb';
import { inferTemplateTags, TEMPLATE_TAG_ORDER, type TemplateTag } from '@/lib/templateTags';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

export type AnyTpl = CrmEmailTemplate & { __isBridge?: boolean };

interface Props {
  onApply: (tpl: AnyTpl) => void;
  activeTemplateId: string | null;
}

export function TemplatesRail({ onApply, activeTemplateId }: Props) {
  const { data: bridge = [], isLoading: bridgeLoading } = useBridgeTemplates();
  const { data: local = [], isLoading: localLoading } = useCrmEmailTemplates();
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<Set<TemplateTag>>(new Set());

  const all: AnyTpl[] = useMemo(() => [
    ...bridge.map((t) => ({ ...t, __isBridge: true })),
    ...local.map((t) => ({ ...t, __isBridge: false })),
  ], [bridge, local]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (q) {
        const hay = `${t.name} ${t.subject} ${t.category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeTags.size > 0) {
        const tags = t.__isBridge ? inferTemplateTags(t as any) : ['Other' as TemplateTag];
        if (!tags.some((tag) => activeTags.has(tag))) return false;
      }
      return true;
    });
  }, [all, search, activeTags]);

  const toggleTag = (tag: TemplateTag) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const isLoading = bridgeLoading || localLoading;

  return (
    <aside className="flex flex-col h-full min-h-0 border-r border-border bg-muted/5">
      <div className="px-3.5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Templates</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">{filtered.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        {/* Tag chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {TEMPLATE_TAG_ORDER.map((tag) => {
            const isActive = activeTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium border transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/60',
                )}
              >
                {tag}
              </button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags(new Set())}
              className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground text-center py-6">Loading templates…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-6 px-3">
            <FileText className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/40" />
            {search.trim() || activeTags.size > 0 ? 'No templates match your filters' : 'No templates yet'}
          </div>
        ) : (
          filtered.map((tpl) => (
            <button
              key={(tpl.__isBridge ? 'b:' : 'l:') + tpl.id}
              type="button"
              onClick={() => onApply(tpl)}
              className={cn(
                'w-full text-left bg-card border rounded-lg overflow-hidden hover:shadow-sm transition-all relative group',
                activeTemplateId === tpl.id
                  ? 'border-primary ring-1 ring-primary/30 shadow-sm'
                  : 'border-border hover:border-primary/50',
              )}
            >
              {tpl.__isBridge && (
                <Badge className="absolute top-1 right-1 z-10 bg-primary/90 text-primary-foreground text-[8px] px-1 py-0 h-3.5">
                  PRESALE
                </Badge>
              )}
              <div className="border-b border-border/40 overflow-hidden bg-muted/20">
                <TemplateThumb html={tpl.body_html ?? ''} />
              </div>
              <div className="p-2">
                <p className="text-[11.5px] font-semibold text-foreground truncate leading-tight">{tpl.name}</p>
                <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                  {tpl.subject || '(no subject)'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
