import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

const CATEGORY_TABS = [
  { value: 'all', label: 'All' },
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: CrmEmailTemplate) => void;
}

export function TemplatePicker({ open, onOpenChange, onSelect }: Props) {
  const { data: templates = [] } = useCrmEmailTemplates();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = templates;
    if (catFilter !== 'all') list = list.filter(t => (t as any).category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [templates, catFilter, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select a Template</DialogTitle>
        </DialogHeader>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CATEGORY_TABS.map(tab => (
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="pl-9 h-9" />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No templates found</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
              {filtered.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => { onSelect(tpl); onOpenChange(false); }}
                  className="text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all"
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
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
