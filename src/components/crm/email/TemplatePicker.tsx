import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Mail, Sparkles, FileText, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useMyAgentSlug } from '@/hooks/useCrmEmail';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

const OWNER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'team', label: 'Team' },
] as const;
type OwnerFilter = typeof OWNER_TABS[number]['value'];

const CATEGORY_TABS = [
  { value: 'all', label: 'All', icon: Layers },
  { value: 'presale', label: 'Presale', icon: Sparkles },
  { value: 'project-launch', label: 'Project Launch', icon: FileText },
  { value: 'follow-up', label: 'Follow-Up', icon: Mail },
  { value: 'nurture', label: 'Nurture', icon: Mail },
  { value: 'welcome', label: 'Welcome', icon: Mail },
  { value: 'general', label: 'General', icon: Mail },
];

/**
 * High-fidelity thumbnail: renders the actual email HTML at desktop width
 * inside a sandbox, then visually scales it down so users see a faithful
 * miniature — not a cropped sliver.
 */
function ThumbPreview({ html, ratio = 'card' }: { html: string; ratio?: 'card' | 'tall' }) {
  const ref = useRef<HTMLIFrameElement>(null);
  // Render at 600px wide (typical email width), then scale to fit thumbnail.
  const RENDER_WIDTH = 600;
  const RENDER_HEIGHT = ratio === 'tall' ? 900 : 700;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#fff;}
      body{font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;}
      img,table{max-width:100%;height:auto;}
      *{box-sizing:border-box;}
    </style></head><body>${html || '<div style="padding:40px;color:#999;text-align:center;">No content</div>'}</body></html>`);
    doc.close();
  }, [html]);

  return (
    <div className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${RENDER_WIDTH} / ${RENDER_HEIGHT}` }}>
      <iframe
        ref={ref}
        title="thumb"
        scrolling="no"
        className="absolute top-0 left-0 border-0 block pointer-events-none bg-white"
        style={{
          width: RENDER_WIDTH,
          height: RENDER_HEIGHT,
          transform: `scale(var(--thumb-scale, 0.5))`,
          transformOrigin: 'top left',
        }}
        sandbox="allow-same-origin"
      />
      {/* Soft fade at the bottom to hint at scrollable content */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: CrmEmailTemplate) => void;
}

type Merged = CrmEmailTemplate & { __isBridge?: boolean };

export function TemplatePicker({ open, onOpenChange, onSelect }: Props) {
  const { data: localTemplates = [] } = useCrmEmailTemplates();
  const { data: bridgeTemplates = [], isLoading: bridgeLoading } = useBridgeTemplates();
  const mySlug = useMyAgentSlug();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');

  useEffect(() => {
    if (!open) {
      setSearch('');
      setCatFilter('all');
      setOwnerFilter('all');
    }
  }, [open]);

  const merged: Merged[] = useMemo(() => {
    const local = localTemplates.map((t) => ({ ...t, __isBridge: false }));
    const bridge = bridgeTemplates.map((t) => ({ ...t, __isBridge: true }));
    return [...bridge, ...local];
  }, [localTemplates, bridgeTemplates]);

  const isMine = (t: Merged) =>
    !!mySlug && (t.owner_agent_slug === mySlug || t.owner_scope === `agent:${mySlug}`);
  const isTeam = (t: Merged) => t.owner_scope === 'team:presale' || !!t.__isBridge;

  const filtered = useMemo(() => {
    let list = merged;
    if (ownerFilter === 'mine') list = list.filter(isMine);
    else if (ownerFilter === 'team') list = list.filter(isTeam);
    if (catFilter === 'presale') {
      list = list.filter((t) => t.__isBridge);
    } else if (catFilter !== 'all') {
      list = list.filter((t) => (t as any).category === catFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [merged, catFilter, search, ownerFilter, mySlug]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: merged.length, presale: 0 };
    for (const t of merged) {
      if (t.__isBridge) map.presale += 1;
      const cat = (t as any).category;
      if (cat) map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [merged]);

  const ownerCounts = useMemo(
    () => ({
      all: merged.length,
      mine: merged.filter(isMine).length,
      team: merged.filter(isTeam).length,
    }),
    [merged, mySlug],
  );

  const useTemplate = (tpl: Merged) => {
    onSelect(tpl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-screen h-[100dvh] sm:w-[96vw] sm:h-[88vh] p-0 overflow-hidden flex flex-col gap-0 rounded-none sm:rounded-2xl [&>button]:hidden">
        {/* Header — single X (auto shadcn close hidden via [&>button]:hidden) */}
        <div className="px-4 sm:px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground truncate">
              Choose a template
            </DialogTitle>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              {filtered.length} of {merged.length}
              {bridgeLoading && ' · loading…'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters row — owner segments + search + category chips */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-border bg-muted/10 shrink-0 space-y-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 w-fit">
            {OWNER_TABS.map((tab) => {
              const active = ownerFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setOwnerFilter(tab.value)}
                  className={cn(
                    'h-7 px-3 rounded-md text-[12px] font-semibold transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                  <span className="text-[10.5px] tabular-nums opacity-70">
                    {ownerCounts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates by name or subject…"
              className="pl-9 h-10 sm:h-9 text-sm sm:text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-none">
            {CATEGORY_TABS.map((tab) => {
              const active = catFilter === tab.value;
              const count = counts[tab.value] ?? 0;
              if (count === 0 && tab.value !== 'all') return null;
              return (
                <button
                  key={tab.value}
                  onClick={() => setCatFilter(tab.value)}
                  className={cn(
                    'shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'text-[10.5px] tabular-nums',
                      active ? 'opacity-70' : 'opacity-60',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template grid — single click to use */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-background">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <FileText className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground">No templates found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a different search or category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((tpl) => (
                <button
                  key={(tpl.__isBridge ? 'b:' : 'l:') + tpl.id}
                  type="button"
                  onClick={() => useTemplate(tpl)}
                  className="group text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/60 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
                  style={{ '--thumb-scale': '0.5' } as React.CSSProperties}
                >
                  <div className="relative border-b border-border/60">
                    {tpl.__isBridge && (
                      <Badge className="absolute top-2 right-2 z-10 bg-primary/95 text-primary-foreground text-[9px] px-1.5 py-0 h-4 shadow-sm">
                        PRESALE
                      </Badge>
                    )}
                    <ThumbPreview html={tpl.body_html || ''} />
                  </div>
                  <div className="p-3">
                    <h4 className="text-[13px] font-semibold text-foreground truncate leading-tight">
                      {tpl.name}
                    </h4>
                    <p className="text-[11px] text-muted-foreground truncate mt-1 leading-tight">
                      {tpl.subject || <span className="italic">(no subject)</span>}
                    </p>
                    {(tpl as any).category && (
                      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 truncate">
                        {(tpl as any).category}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
