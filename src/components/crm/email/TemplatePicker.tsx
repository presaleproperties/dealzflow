import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Monitor, Smartphone, ArrowLeft, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useBridgeTemplates } from '@/hooks/useBridgeEmail';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

const CATEGORY_TABS = [
  { value: 'all', label: 'All' },
  { value: 'presale', label: 'Presale Properties' },
  { value: 'project-launch', label: 'Project Launch' },
  { value: 'follow-up', label: 'Follow-Up' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'general', label: 'General' },
];

function MiniPreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (ref.current) {
      const doc = ref.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<div style="transform:scale(0.3);transform-origin:top left;width:333%;pointer-events:none;">${html}</div>`);
        doc.close();
      }
    }
  }, [html]);
  return <iframe ref={ref} title="tpl" className="w-full h-[140px] border-0 rounded bg-white" sandbox="allow-same-origin" />;
}

/** Full-fidelity preview that renders the template HTML exactly as recipients will see it. */
function FullPreview({ html, width }: { html: string; width: 'desktop' | 'mobile' }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (ref.current) {
      const doc = ref.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html || '<p style="color:#888;font-family:sans-serif;padding:20px;">No content</p>');
        doc.close();
      }
    }
  }, [html, width]);
  return (
    <div className="flex justify-center bg-muted/20 rounded-lg p-3 h-full">
      <div
        className="rounded-md border border-border/40 bg-white overflow-hidden shadow-sm transition-all"
        style={{ width: width === 'desktop' ? '100%' : '375px', maxWidth: '100%', height: '100%' }}
      >
        <iframe
          ref={ref}
          title="Template full preview"
          className="w-full h-full border-0 block"
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
  const [previewTpl, setPreviewTpl] = useState<Merged | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  // Reset preview state when the dialog re-opens
  useEffect(() => {
    if (!open) {
      setPreviewTpl(null);
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
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
    }
    return list;
  }, [merged, catFilter, search]);

  const applyPreview = () => {
    if (previewTpl) {
      onSelect(previewTpl);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {previewTpl ? (
              <>
                <button
                  onClick={() => setPreviewTpl(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
                </button>
                <span className="text-sm text-foreground/80 truncate">· {previewTpl.name}</span>
              </>
            ) : (
              <>
                Select a Template
                {bridgeLoading && <span className="ml-2 text-xs text-muted-foreground font-normal">· loading Presale library…</span>}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {previewTpl ? (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Preview controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  Subject: <span className="text-foreground/80 font-medium">{previewTpl.subject || '—'}</span>
                </p>
                {previewTpl.__isBridge && (
                  <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0">PRESALE</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
                  <button
                    onClick={() => setPreviewWidth('desktop')}
                    className={`px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[11px] font-medium ${previewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    title="Desktop view"
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                  <button
                    onClick={() => setPreviewWidth('mobile')}
                    className={`px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[11px] font-medium ${previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    title="Mobile view"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </button>
                </div>
                <Button size="sm" className="h-8 gap-1.5" onClick={applyPreview}>
                  <Check className="w-3.5 h-3.5" /> Use this template
                </Button>
              </div>
            </div>

            {/* Full preview pane */}
            <div className="flex-1 min-h-0">
              <FullPreview html={previewTpl.body_html || ''} width={previewWidth} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setCatFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    catFilter === tab.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="pl-9 h-9" />
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No templates found</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
                  {filtered.map((tpl) => (
                    <div
                      key={(tpl.__isBridge ? 'bridge:' : 'local:') + tpl.id}
                      className="text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all relative group flex flex-col"
                    >
                      {tpl.__isBridge && (
                        <Badge className="absolute top-2 right-2 z-10 bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0">
                          PRESALE
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => setPreviewTpl(tpl)}
                        className="block text-left"
                        aria-label={`Preview ${tpl.name}`}
                      >
                        <div className="overflow-hidden border-b border-border/40">
                          {tpl.body_html ? <MiniPreview html={tpl.body_html} /> : (
                            <div className="h-[140px] bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">No preview</div>
                          )}
                        </div>
                        <div className="p-3 space-y-1">
                          <h4 className="text-sm font-semibold text-foreground truncate">{tpl.name}</h4>
                          <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>
                        </div>
                      </button>
                      <div className="px-3 pb-3 flex items-center gap-2 mt-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] flex-1"
                          onClick={() => setPreviewTpl(tpl)}
                        >
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[11px] flex-1"
                          onClick={() => { onSelect(tpl); onOpenChange(false); }}
                        >
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
