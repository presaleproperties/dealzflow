import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Pencil, Search, Copy, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmEmailTemplates, useCreateTemplate, useDeleteTemplate } from '@/hooks/useCrmEmail';
import { TemplateEditorDialog } from '@/components/crm/templates/TemplateEditorDialog';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'project-launch', label: 'Project Launch', color: 'hsl(39 67% 55%)' },
  { value: 'follow-up', label: 'Follow-Up', color: 'hsl(210 80% 55%)' },
  { value: 'nurture', label: 'Nurture', color: 'hsl(142 60% 45%)' },
  { value: 'welcome', label: 'Welcome', color: 'hsl(270 60% 55%)' },
  { value: 'general', label: 'General', color: 'hsl(0 0% 55%)' },
];

function getCategoryColor(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.color ?? 'hsl(0 0% 55%)';
}
function getCategoryLabel(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}

function TemplatePreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (ref.current) {
      const doc = ref.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<div style="transform:scale(0.35);transform-origin:top left;width:286%;pointer-events:none;">${html}</div>`);
        doc.close();
      }
    }
  }, [html]);
  return (
    <iframe
      ref={ref}
      title="preview"
      className="w-full border-0 rounded bg-white"
      style={{ height: '180px' }}
      sandbox="allow-same-origin"
    />
  );
}

export default function CrmTemplatesPage() {
  const { data: templates = [], isLoading } = useCrmEmailTemplates();
  const duplicateTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const [editing, setEditing] = useState<CrmEmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = templates;
    if (catFilter !== 'all') list = list.filter(t => (t as any).category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
    }
    return list;
  }, [templates, catFilter, search]);

  const handleDuplicate = async (tpl: CrmEmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    await duplicateTemplate.mutateAsync({
      name: `${tpl.name} (Copy)`,
      subject: tpl.subject,
      body_html: tpl.body_html ?? '',
      category: (tpl as any).category ?? 'general',
      merge_tags: (tpl as any).merge_tags ?? [],
    } as any);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTemplate.mutateAsync(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <h1 className="text-lg font-bold text-foreground">Email Templates</h1>
        <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground min-h-[44px] sm:min-h-0" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm text-muted-foreground">
            {templates.length === 0
              ? 'No templates yet. Create your first template or paste HTML from your email builder.'
              : 'No templates match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map(tpl => (
            <div
              key={tpl.id}
              className="group relative bg-card border border-border rounded-[10px] lg:rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setEditing(tpl)}
            >
              {/* HTML Preview thumbnail */}
              <div className="overflow-hidden border-b border-border/40">
                {tpl.body_html ? (
                  <TemplatePreview html={tpl.body_html} />
                ) : (
                  <div className="h-[180px] bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">No HTML content</div>
                )}
              </div>

              <div className="p-3 sm:p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{tpl.name}</h3>
                <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-0 text-[10px] font-semibold"
                    style={{ background: `${getCategoryColor((tpl as any).category || 'general')} / 0.15`, color: getCategoryColor((tpl as any).category || 'general') }}
                  >
                    {getCategoryLabel((tpl as any).category || 'general')}
                  </Badge>
                  {tpl.project && (
                    <Badge variant="outline" className="text-[10px]">{tpl.project}</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Used {tpl.times_used ?? 0}×</span>
                  <span>{tpl.created_at ? format(new Date(tpl.created_at), 'MMM d, yyyy') : ''}</span>
                </div>
              </div>

              {/* Hover actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="secondary" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setEditing(tpl); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="secondary" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleDuplicate(tpl, e)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button variant="secondary" size="sm" className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => handleDelete(tpl.id, e)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        template={editing}
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) { setEditing(null); setCreating(false); } }}
      />
    </div>
  );
}
