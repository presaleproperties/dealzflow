import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Monitor, Smartphone, Check, X, Mail, Sparkles, FileText, Layers } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useBridgeTemplates } from '@/hooks/useBridgeEmail';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

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
function ThumbPreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  // Render at 600px wide (typical email width), then scale to fit thumbnail.
  const RENDER_WIDTH = 600;
  const RENDER_HEIGHT = 800;
  const SCALE = 0.34; // → 204 × 272 visible

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
    <div
      className="relative overflow-hidden bg-white"
      style={{ width: RENDER_WIDTH * SCALE, height: RENDER_HEIGHT * SCALE }}
    >
      <iframe
        ref={ref}
        title="thumb"
        scrolling="no"
        className="border-0 block pointer-events-none bg-white"
        style={{
          width: RENDER_WIDTH,
          height: RENDER_HEIGHT,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
        }}
        sandbox="allow-same-origin"
      />
      {/* Soft fade at the bottom to hint at scrollable content */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </div>
  );
}

/** Full-fidelity preview pane — fills its parent and scrolls long emails. */
function FullPreview({ html, width }: { html: string; width: 'desktop' | 'mobile' }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      html
        ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;}body{font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;}img,table{max-width:100%;height:auto;}</style></head><body>${html}</body></html>`
        : '<p style="color:#888;font-family:sans-serif;padding:24px;">No content</p>',
    );
    doc.close();
  }, [html, width]);

  return (
    <div className="h-full w-full flex justify-center bg-muted/20 p-3 overflow-hidden">
      <div
        className="rounded-xl border border-border/60 bg-white overflow-hidden shadow-sm transition-all h-full"
        style={{ width: width === 'desktop' ? '100%' : '375px', maxWidth: '100%' }}
      >
        <iframe
          ref={ref}
          title="Template full preview"
          className="w-full h-full border-0 block bg-white"
          sandbox="allow-same-origin"
        />
      </div>
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
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch('');
      setCatFilter('all');
      setPreviewWidth('desktop');
    }
  }, [open]);

  const merged: Merged[] = useMemo(() => {
    const local = localTemplates.map((t) => ({ ...t, __isBridge: false }));
    const bridge = bridgeTemplates.map((t) => ({ ...t, __isBridge: true }));
    return [...bridge, ...local];
  }, [localTemplates, bridgeTemplates]);

  const filtered = useMemo(() => {
    let list = merged;
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
  }, [merged, catFilter, search]);

  const selected = useMemo(
    () => filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: merged.length, presale: 0 };
    for (const t of merged) {
      if (t.__isBridge) map.presale += 1;
      const cat = (t as any).category;
      if (cat) map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [merged]);

  const useTemplate = (tpl: Merged) => {
    onSelect(tpl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[96vw] h-[88vh] p-0 overflow-hidden flex flex-col gap-0">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">Select a Template</h2>
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} of {merged.length}
              {bridgeLoading && ' · loading Presale library…'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters row */}
        <div className="px-5 py-2.5 border-b border-border bg-muted/10 flex items-center gap-3 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-[360px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or subject…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {CATEGORY_TABS.map((tab) => {
              const active = catFilter === tab.value;
              const count = counts[tab.value] ?? 0;
              return (
                <button
                  key={tab.value}
                  onClick={() => setCatFilter(tab.value)}
                  className={cn(
                    'h-7 px-2.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'text-[10px] px-1 py-0 rounded',
                      active ? 'bg-primary-foreground/20' : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Master / detail body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] overflow-hidden min-h-0">
          {/* Template list */}
          <aside className="border-r border-border overflow-y-auto bg-background">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No templates match your filters
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((tpl) => {
                  const isActive = selected?.id === tpl.id;
                  return (
                    <li key={(tpl.__isBridge ? 'b:' : 'l:') + tpl.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(tpl.id)}
                        onDoubleClick={() => useTemplate(tpl)}
                        className={cn(
                          'w-full text-left px-3 py-3 flex gap-3 items-start transition-colors group',
                          isActive
                            ? 'bg-primary/5 ring-1 ring-inset ring-primary/30'
                            : 'hover:bg-muted/40',
                        )}
                      >
                        {/* Thumbnail */}
                        <div className="shrink-0 rounded-lg border border-border overflow-hidden bg-white">
                          <ThumbPreview html={tpl.body_html || ''} />
                        </div>
                        {/* Meta */}
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4
                              className={cn(
                                'text-sm font-semibold truncate',
                                isActive ? 'text-foreground' : 'text-foreground',
                              )}
                            >
                              {tpl.name}
                            </h4>
                            {tpl.__isBridge && (
                              <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0 h-4 shrink-0">
                                PRESALE
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                            {tpl.subject || <span className="italic">(no subject)</span>}
                          </p>
                          {(tpl as any).category && (
                            <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                              {(tpl as any).category}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Preview pane */}
          <section className="flex flex-col overflow-hidden min-h-0 bg-muted/10">
            {selected ? (
              <>
                <div className="px-5 py-3 border-b border-border bg-card flex items-start justify-between gap-3 shrink-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Subject
                      </p>
                      {selected.__isBridge && (
                        <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0 h-4">
                          PRESALE
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {selected.subject || selected.name}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {selected.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
                      <button
                        onClick={() => setPreviewWidth('desktop')}
                        className={cn(
                          'h-7 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors',
                          previewWidth === 'desktop'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        Desktop
                      </button>
                      <button
                        onClick={() => setPreviewWidth('mobile')}
                        className={cn(
                          'h-7 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors',
                          previewWidth === 'mobile'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Mobile
                      </button>
                    </div>
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => useTemplate(selected)}>
                      <Check className="h-3.5 w-3.5" />
                      Use this template
                    </Button>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <FullPreview html={selected.body_html || ''} width={previewWidth} />
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                Select a template on the left to preview it here.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
