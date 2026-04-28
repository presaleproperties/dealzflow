// TemplatesRail — left pane of the email workspace. Searchable, tag-filterable
// template library merged from local CRM templates + Presale bridge templates.
// Click a card → applies to the live composer.

import { useMemo, useState } from 'react';
import { Search, Sparkles, FileText, Tag, X, RefreshCw } from 'lucide-react';
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
        // Bridge templates: infer tags from name/category. Local templates: use category as a tag if it matches.
        let tags: TemplateTag[];
        if (t.__isBridge) {
          tags = inferTemplateTags(t as any);
        } else {
          const cat = (t.category ?? '').trim();
          const matched = TEMPLATE_TAG_ORDER.find((tag) => tag.toLowerCase() === cat.toLowerCase());
          tags = matched ? [matched] : ['Other' as TemplateTag];
        }
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
    <aside className="flex flex-col h-full min-h-0 border-r border-border bg-card/50">
      <div className="px-4 pt-4 pb-3 border-b border-border/70 bg-card shrink-0 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-[13px] font-semibold tracking-tight text-foreground leading-none">Templates</h3>
            <p className="text-[10.5px] text-muted-foreground mt-1">{filtered.length.toLocaleString()} available</p>
          </div>
          <Sparkles className="h-3.5 w-3.5 text-primary/70" />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-8 h-9 text-[12.5px] bg-background"
          />
        </div>
        {/* Tag chips */}
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_TAG_ORDER.map((tag) => {
            const isActive = activeTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'inline-flex items-center h-6 px-2 rounded-full text-[10.5px] font-medium border transition-colors',
                  isActive
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border/70 hover:text-foreground hover:border-foreground/30',
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
              className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded-full text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {isLoading ? (
          <div className="text-[11.5px] text-muted-foreground text-center py-8">Loading templates…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[11.5px] text-muted-foreground text-center py-10 px-3">
            <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            {search.trim() || activeTags.size > 0 ? 'No templates match your filters' : 'No templates yet'}
          </div>
        ) : (
          filtered.map((tpl) => (
            <button
              key={(tpl.__isBridge ? 'b:' : 'l:') + tpl.id}
              type="button"
              onClick={() => onApply(tpl)}
              className={cn(
                'w-full text-left bg-card border rounded-xl overflow-hidden transition-all relative group',
                activeTemplateId === tpl.id
                  ? 'border-primary/70 ring-2 ring-primary/15 shadow-sm'
                  : 'border-border/70 hover:border-foreground/25 hover:shadow-sm',
              )}
            >
              {tpl.__isBridge && (
                <Badge className="absolute top-1.5 right-1.5 z-10 bg-foreground text-background text-[8.5px] px-1.5 py-0 h-4 tracking-wider font-bold uppercase border-0">
                  Presale
                </Badge>
              )}
              <div className="border-b border-border/40 overflow-hidden bg-muted/10">
                <TemplateThumb html={tpl.body_html ?? ''} />
              </div>
              <div className="px-2.5 py-2">
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{tpl.name}</p>
                <p className="text-[10.5px] text-muted-foreground truncate mt-0.5 leading-tight">
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
