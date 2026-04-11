import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, Star, Copy, Trash2, Pencil, Eye, ArrowLeft, Code, ExternalLink, SlidersHorizontal, ArrowUpDown, Heart, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useEmailTemplates,
  useEmailTemplateStats,
  useCreateEmailTemplate,
  useSoftDeleteEmailTemplate,
  useToggleFavorite,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { TemplateEditor } from '@/components/crm/templates/TemplateEditor';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'project_launch', label: 'Project Launch', color: 'hsl(39 67% 55%)' },
  { value: 'nurture', label: 'Nurture', color: 'hsl(142 60% 45%)' },
  { value: 'follow_up', label: 'Follow-Up', color: 'hsl(210 80% 55%)' },
  { value: 'newsletter', label: 'Newsletter', color: 'hsl(270 60% 55%)' },
  { value: 'announcement', label: 'Announcement', color: 'hsl(15 80% 55%)' },
  { value: 're_engagement', label: 'Re-Engagement', color: 'hsl(340 65% 55%)' },
  { value: 'custom', label: 'Custom', color: 'hsl(0 0% 55%)' },
];

const SOURCES = [
  { value: 'all', label: 'All Sources' },
  { value: 'pp_admin', label: 'PP Admin' },
  { value: 'dealflow', label: 'DealsFlow' },
  { value: 'claude', label: 'Claude' },
  { value: 'manual', label: 'Manual' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'used', label: 'Most Used' },
  { value: 'alpha', label: 'Alphabetical' },
];

function getCategoryColor(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? 'hsl(0 0% 55%)';
}
function getCategoryLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}
function getSourceLabel(src: string) {
  return SOURCES.find(s => s.value === src)?.label ?? src;
}
function getSourceColor(src: string) {
  switch (src) {
    case 'pp_admin': return 'hsl(210 80% 55%)';
    case 'dealflow': return 'hsl(39 67% 55%)';
    case 'claude': return 'hsl(270 60% 55%)';
    default: return 'hsl(0 0% 55%)';
  }
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
      style={{ height: '160px' }}
      sandbox="allow-same-origin"
    />
  );
}

export default function CrmTemplatesPage() {
  const { data: templates = [], isLoading } = useEmailTemplates();
  const { total, bySource } = useEmailTemplateStats();
  const duplicateTemplate = useCreateEmailTemplate();
  const softDelete = useSoftDeleteEmailTemplate();
  const toggleFav = useToggleFavorite();

  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState('recent');

  // Collect all unique project tags
  const allProjectTags = useMemo(() => {
    const tags = new Set<string>();
    templates.forEach(t => t.project_tags?.forEach(p => tags.add(p)));
    return [...tags].sort();
  }, [templates]);
  const [projectFilter, setProjectFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...templates];
    if (catFilter !== 'all') list = list.filter(t => t.category === catFilter);
    if (sourceFilter !== 'all') list = list.filter(t => t.source === sourceFilter);
    if (projectFilter !== 'all') list = list.filter(t => t.project_tags?.includes(projectFilter));
    if (favOnly) list = list.filter(t => t.is_favorite);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q));
    }
    switch (sortBy) {
      case 'used': list.sort((a, b) => b.times_used - a.times_used); break;
      case 'alpha': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return list;
  }, [templates, catFilter, sourceFilter, projectFilter, favOnly, search, sortBy]);

  const handleDuplicate = async (tpl: EmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    await duplicateTemplate.mutateAsync({
      name: `${tpl.name} (Copy)`,
      subject: tpl.subject,
      html_content: tpl.html_content,
      category: tpl.category,
      project_tags: tpl.project_tags,
      area_tags: tpl.area_tags,
      source: 'dealflow',
    });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await softDelete.mutateAsync(id);
  };

  const handleToggleFav = async (tpl: EmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFav.mutateAsync({ id: tpl.id, is_favorite: !tpl.is_favorite });
  };

  const handleCopyHtml = (tpl: EmailTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tpl.html_content);
    toast.success('HTML copied to clipboard');
  };

  const openEditor = (tpl: EmailTemplate) => {
    setEditing(tpl);
    setViewMode('editor');
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setViewMode('editor');
  };

  const closeEditor = () => {
    setEditing(null);
    setCreating(false);
    setViewMode('list');
  };

  // EDITOR VIEW
  if (viewMode === 'editor') {
    return <TemplateEditor template={editing} onClose={closeEditor} />;
  }

  // LIST VIEW
  return (
    <div className="space-y-4">
      {/* Sync Status Bar */}
      <div className="flex items-center justify-between rounded-lg bg-card/60 border border-border/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Unified Template Library</span>
          <span className="text-xs text-muted-foreground">— synced with presaleproperties.com admin</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{total} templates</span>
          {Object.entries(bySource).map(([src, count]) => (
            <Badge key={src} variant="outline" className="text-[10px] gap-1 border-border/40">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: getSourceColor(src) }} />
              {getSourceLabel(src)}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Email Templates</h1>
        <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openCreate}>
          <Plus className="w-4 h-4" /> New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-full sm:w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {allProjectTags.length > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full sm:w-[150px] h-9"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {allProjectTags.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Button
          variant={favOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9 gap-1.5 px-3"
          onClick={() => setFavOnly(!favOnly)}
        >
          <Star className={`w-3.5 h-3.5 ${favOnly ? 'fill-current' : ''}`} />
          Favorites
        </Button>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[140px] h-9">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="pl-9 h-9" />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm text-muted-foreground">
            {templates.length === 0
              ? 'No templates yet. Create your first or wait for PP Admin sync.'
              : 'No templates match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(tpl => (
            <div
              key={tpl.id}
              className="group relative bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => openEditor(tpl)}
            >
              {/* Preview */}
              <div className="overflow-hidden border-b border-border/30">
                {tpl.html_content ? (
                  <TemplatePreview html={tpl.html_content} />
                ) : (
                  <div className="h-[160px] bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">No HTML content</div>
                )}
              </div>

              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate flex-1">{tpl.name}</h3>
                  <button
                    className="shrink-0 mt-0.5"
                    onClick={(e) => handleToggleFav(tpl, e)}
                  >
                    <Star className={`w-3.5 h-3.5 transition-colors ${tpl.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground/40 hover:text-primary/60'}`} />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground truncate">{tpl.subject || 'No subject'}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-0 text-[10px] font-semibold px-1.5 py-0"
                    style={{ background: `${getCategoryColor(tpl.category)}20`, color: getCategoryColor(tpl.category) }}
                  >
                    {getCategoryLabel(tpl.category)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-0 text-[10px] font-semibold px-1.5 py-0"
                    style={{ background: `${getSourceColor(tpl.source)}20`, color: getSourceColor(tpl.source) }}
                  >
                    {getSourceLabel(tpl.source)}
                  </Badge>
                  {tpl.project_tags?.slice(0, 2).map(tag => (
                    <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 border-border/40">{tag.replace(/_/g, ' ')}</Badge>
                  ))}
                  {(tpl.project_tags?.length || 0) > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{tpl.project_tags.length - 2}</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>Used {tpl.times_used}×</span>
                  <span>{format(new Date(tpl.updated_at), 'MMM d, yyyy')}</span>
                </div>
              </div>

              {/* Hover actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="secondary" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEditor(tpl); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="secondary" size="sm" className="h-7 w-7 p-0" onClick={(e) => handleCopyHtml(tpl, e)}>
                  <Code className="w-3.5 h-3.5" />
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
    </div>
  );
}
