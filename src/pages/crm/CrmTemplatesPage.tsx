import { useMemo, useState } from 'react';
import {
  Mail, MessageSquare, Plus, Search, FileText, Star, Pencil,
  Copy as CopyIcon, Trash2, Send, Eye, RefreshCw, AlertCircle,
  CheckCircle2, Sparkles, ArrowUpRight, Users, User, X, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useEmailTemplates,
  useSoftDeleteEmailTemplate,
  useToggleFavorite,
  useDuplicateTemplate,
  useChangeTemplateScope,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { useBridgeTemplates, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { TemplateEditor } from '@/components/crm/templates/TemplateEditor';
import { useSmsTemplates } from '@/hooks/useSms';
import { Link } from 'react-router-dom';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PresaleTemplatePreviewDialog } from '@/components/crm/marketing/PresaleTemplatePreviewDialog';
import { stripSignatureBlock } from '@/lib/templateSignature';
import { renderWithSampleData } from '@/lib/emailVariables';

// ===================================================================
// Page shell
// ===================================================================
export default function CrmTemplatesPage() {
  const [tab, setTab] = useState<'email' | 'messaging'>('email');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-gradient-to-br from-card via-card to-muted/30 px-4 sm:px-6 py-4 shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Templates</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Browse, duplicate and ship email templates — for you, your team, and the live Presale catalog.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden"
        style={{ paddingBottom: 'var(--bottom-nav-pad, 0px)' }}
      >
        <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-6 py-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'messaging')} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 max-w-md mb-3 shrink-0">
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="messaging" className="gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> SMS
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="flex-1 overflow-hidden mt-0">
              <EmailTemplatesPanel />
            </TabsContent>

            <TabsContent value="messaging" className="mt-0">
              <MessagingPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// Two-pane email panel: Library rail + Preview pane
// ===================================================================

type ScopeFilter = 'all' | 'mine' | 'team' | 'presale' | 'favorites';

type UnifiedTemplate =
  | { kind: 'local'; id: string; tpl: EmailTemplate }
  | { kind: 'presale'; id: string; asset: BridgeTemplate };

const CATEGORY_LABELS: Record<string, string> = {
  project_launch: 'Project Launch',
  nurture: 'Nurture',
  follow_up: 'Follow-Up',
  newsletter: 'Newsletter',
  announcement: 'Announcement',
  re_engagement: 'Re-Engagement',
  custom: 'Custom',
  general: 'General',
};

function unifiedKey(u: UnifiedTemplate): string {
  return u.id;
}

function unifiedName(u: UnifiedTemplate): string {
  return u.kind === 'local' ? u.tpl.name : u.asset.name;
}

function unifiedSubject(u: UnifiedTemplate): string | null {
  return u.kind === 'local' ? u.tpl.subject : u.asset.subject ?? null;
}

function unifiedHtml(u: UnifiedTemplate): string {
  return u.kind === 'local' ? u.tpl.html_content : u.asset.body_html ?? '';
}

function unifiedCategory(u: UnifiedTemplate): string {
  return u.kind === 'local'
    ? u.tpl.category
    : (u.asset.category ?? 'general');
}

function unifiedTags(u: UnifiedTemplate): string[] {
  return u.kind === 'local' ? u.tpl.project_tags ?? [] : u.asset.tags_raw ?? [];
}

function unifiedScopeLabel(u: UnifiedTemplate): { label: string; tone: 'gold' | 'team' | 'mine' | 'presale' } {
  if (u.kind === 'presale') return { label: 'Presale', tone: 'presale' };
  const scope = u.tpl.owner_scope ?? '';
  if (scope === 'team:presale') return { label: 'Team', tone: 'team' };
  if (scope.startsWith('agent:')) return { label: 'Mine', tone: 'mine' };
  return { label: 'Library', tone: 'gold' };
}

function EmailTemplatesPanel() {
  const localQ = useEmailTemplates();
  const bridgeQ = useBridgeTemplates();

  const softDelete = useSoftDeleteEmailTemplate();
  const toggleFav = useToggleFavorite();
  const duplicate = useDuplicateTemplate();
  const changeScope = useChangeTemplateScope();

  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloneDraft, setCloneDraft] = useState<{
    name: string; subject: string | null; html_content: string; category: string;
    project_tags: string[]; area_tags: string[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);
  const [previewAsset, setPreviewAsset] = useState<BridgeTemplate | null>(null);
  const [sendAsset, setSendAsset] = useState<BridgeTemplate | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const localTemplates = localQ.data ?? [];
  const presaleAssets = (bridgeQ.data ?? []).filter((a) => a.asset_type === 'email');

  // Build the unified list once, then filter in successive passes.
  const all: UnifiedTemplate[] = useMemo(() => {
    const items: UnifiedTemplate[] = [];
    for (const tpl of localTemplates) items.push({ kind: 'local', id: `l-${tpl.id}`, tpl });
    for (const asset of presaleAssets) items.push({ kind: 'presale', id: `p-${asset.id}`, asset });
    return items;
  }, [localTemplates, presaleAssets]);

  const counts = useMemo(() => {
    const c = {
      all: all.length,
      mine: 0,
      team: 0,
      presale: 0,
      favorites: 0,
      byCategory: {} as Record<string, number>,
      tags: new Map<string, number>(),
    };
    for (const u of all) {
      if (u.kind === 'presale') c.presale++;
      else {
        const s = u.tpl.owner_scope ?? '';
        if (s === 'team:presale') c.team++;
        else if (s.startsWith('agent:')) c.mine++;
        if (u.tpl.is_favorite) c.favorites++;
      }
      const cat = unifiedCategory(u);
      c.byCategory[cat] = (c.byCategory[cat] || 0) + 1;
      for (const t of unifiedTags(u)) {
        c.tags.set(t, (c.tags.get(t) || 0) + 1);
      }
    }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((u) => {
      // Scope
      if (scope === 'mine' && (u.kind !== 'local' || !(u.tpl.owner_scope ?? '').startsWith('agent:'))) return false;
      if (scope === 'team' && (u.kind !== 'local' || u.tpl.owner_scope !== 'team:presale')) return false;
      if (scope === 'presale' && u.kind !== 'presale') return false;
      if (scope === 'favorites' && (u.kind !== 'local' || !u.tpl.is_favorite)) return false;
      // Category
      if (activeCategory && unifiedCategory(u) !== activeCategory) return false;
      // Tag
      if (activeTag && !unifiedTags(u).includes(activeTag)) return false;
      // Search
      if (q) {
        const hay = `${unifiedName(u)} ${unifiedSubject(u) ?? ''} ${unifiedCategory(u)} ${unifiedTags(u).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, search, scope, activeCategory, activeTag]);

  // Auto-select first when filter changes
  const selected = useMemo(() => {
    if (selectedKey) {
      const found = filtered.find((u) => u.id === selectedKey);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [filtered, selectedKey]);

  const cloneToLibrary = (asset: BridgeTemplate) => {
    setCloneDraft({
      name: `${asset.name} (Copy)`,
      subject: asset.subject ?? null,
      html_content: stripSignatureBlock(asset.body_html || ''),
      category: 'project_launch',
      project_tags: [],
      area_tags: [],
    });
    setCreating(true);
  };

  const isLoading = localQ.isLoading || bridgeQ.isLoading;
  const topTags = useMemo(
    () => [...counts.tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    [counts.tags],
  );

  const clearFilters = activeCategory || activeTag || search || scope !== 'all';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-full">
      {/* ======================== LEFT RAIL ======================== */}
      <aside className="hidden lg:flex flex-col gap-3 overflow-hidden">
        <div className="space-y-2">
          <Button size="sm" className="w-full gap-1.5" onClick={() => { setCloneDraft(null); setCreating(true); }}>
            <Plus className="w-3.5 h-3.5" /> New template
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => { setCloneDraft(null); setCreating(true); }}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Draft with AI
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 -mr-2 pr-2">
          <RailSection title="Library">
            <RailItem
              icon={<FileText className="w-3.5 h-3.5" />}
              label="All"
              count={counts.all}
              active={scope === 'all'}
              onClick={() => setScope('all')}
            />
            <RailItem
              icon={<User className="w-3.5 h-3.5" />}
              label="Mine"
              count={counts.mine}
              active={scope === 'mine'}
              onClick={() => setScope('mine')}
            />
            <RailItem
              icon={<Users className="w-3.5 h-3.5" />}
              label="Team"
              count={counts.team}
              active={scope === 'team'}
              onClick={() => setScope('team')}
            />
            <RailItem
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
              label="Presale"
              count={counts.presale}
              active={scope === 'presale'}
              onClick={() => setScope('presale')}
            />
            <RailItem
              icon={<Star className="w-3.5 h-3.5" />}
              label="Favorites"
              count={counts.favorites}
              active={scope === 'favorites'}
              onClick={() => setScope('favorites')}
            />
          </RailSection>

          <RailSection title="Category">
            {Object.entries(counts.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <RailItem
                  key={key}
                  label={CATEGORY_LABELS[key] ?? key}
                  count={count}
                  active={activeCategory === key}
                  onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                />
              ))}
          </RailSection>

          {topTags.length > 0 && (
            <RailSection title="Tags">
              <div className="flex flex-wrap gap-1 px-1.5">
                {topTags.map(([tag, n]) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                      activeTag === tag
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border',
                    )}
                  >
                    {tag.replace(/_/g, ' ')} <span className="opacity-50">·{n}</span>
                  </button>
                ))}
              </div>
            </RailSection>
          )}

          <div className="px-1.5 mt-3">
            <BridgeStatusPill
              isError={bridgeQ.isError}
              isFetching={bridgeQ.isFetching}
              updatedAt={bridgeQ.dataUpdatedAt}
              onRefresh={async () => {
                const t = toast.loading('Pulling latest from Presale…');
                try {
                  const { data, error } = await supabase.functions.invoke('sync-bridge-templates', { body: {} });
                  if (error) throw error;
                  if ((data as any)?.skipped === 'presale_sync_disabled') {
                    toast.message("Presale template sync isn't live yet", { id: t });
                  } else {
                    await Promise.all([localQ.refetch(), bridgeQ.refetch()]);
                    toast.success('Templates synced from Presale', { id: t });
                  }
                } catch (e: any) {
                  toast.error(e?.message || 'Sync failed', { id: t });
                }
              }}
            />
          </div>
        </ScrollArea>
      </aside>

      {/* ======================== MAIN GRID + PREVIEW ======================== */}
      <main className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4 overflow-hidden">
        {/* Card grid */}
        <div className="flex flex-col overflow-hidden">
          {/* Mobile toolbar */}
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={() => { setCloneDraft(null); setCreating(true); }} className="shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Active filter chips */}
          {clearFilters && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <Filter className="w-3 h-3 text-muted-foreground" />
              {scope !== 'all' && (
                <FilterChip label={scope} onClear={() => setScope('all')} />
              )}
              {activeCategory && (
                <FilterChip
                  label={CATEGORY_LABELS[activeCategory] ?? activeCategory}
                  onClear={() => setActiveCategory(null)}
                />
              )}
              {activeTag && <FilterChip label={`#${activeTag}`} onClear={() => setActiveTag(null)} />}
              {search && <FilterChip label={`"${search}"`} onClear={() => setSearch('')} />}
              <button
                onClick={() => { setScope('all'); setActiveCategory(null); setActiveTag(null); setSearch(''); }}
                className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {isLoading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading templates…</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-10 text-center space-y-2">
              <Mail className="w-7 h-7 mx-auto opacity-40" />
              <div className="text-sm text-muted-foreground">
                {search || activeCategory || activeTag
                  ? 'No templates match your filters.'
                  : 'No templates yet — create one or clone from Presale.'}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setCloneDraft(null); setCreating(true); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New template
              </Button>
            </Card>
          ) : (
            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pb-3">
                {filtered.map((u) => (
                  <UnifiedCard
                    key={unifiedKey(u)}
                    item={u}
                    selected={selected?.id === u.id}
                    onSelect={() => setSelectedKey(u.id)}
                    onEdit={u.kind === 'local' ? () => setEditing(u.tpl) : undefined}
                    onToggleFav={u.kind === 'local'
                      ? () => toggleFav.mutate({ id: u.tpl.id, is_favorite: !u.tpl.is_favorite })
                      : undefined}
                    onDelete={u.kind === 'local' ? () => setPendingDelete(u.tpl) : undefined}
                    onDuplicate={u.kind === 'local' ? () => duplicate.mutate(u.tpl) : () => cloneToLibrary(u.asset)}
                    onPromote={u.kind === 'local' && (u.tpl.owner_scope ?? '').startsWith('agent:')
                      ? () => changeScope.mutate({ id: u.tpl.id, scope: 'team' })
                      : undefined}
                    onPullToMine={u.kind === 'local' && u.tpl.owner_scope === 'team:presale'
                      ? () => changeScope.mutate({ id: u.tpl.id, scope: 'mine' })
                      : undefined}
                    onPreviewPresale={u.kind === 'presale' ? () => setPreviewAsset(u.asset) : undefined}
                    onSendPresale={u.kind === 'presale' ? () => setSendAsset(u.asset) : undefined}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Preview pane */}
        <aside className="hidden xl:flex flex-col overflow-hidden">
          {selected ? (
            <PreviewPane
              item={selected}
              onEdit={selected.kind === 'local' ? () => setEditing(selected.tpl) : undefined}
              onClone={() => {
                if (selected.kind === 'local') duplicate.mutate(selected.tpl);
                else cloneToLibrary(selected.asset);
              }}
              onSendPresale={selected.kind === 'presale' ? () => setSendAsset(selected.asset) : undefined}
            />
          ) : (
            <Card className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Pick a template to preview
            </Card>
          )}
        </aside>
      </main>

      {/* Editor dialog */}
      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) { setEditing(null); setCreating(false); setCloneDraft(null); }
        }}
      >
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-4">
          <TemplateEditor
            template={editing}
            initialDraft={!editing && creating ? cloneDraft ?? undefined : undefined}
            onClose={() => { setEditing(null); setCreating(false); setCloneDraft(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The template will be hidden from your library. Sent emails are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDelete) softDelete.mutate(pendingDelete.id); setPendingDelete(null); }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Presale dialogs */}
      <PresaleTemplatePreviewDialog
        asset={previewAsset}
        open={!!previewAsset}
        onOpenChange={(v) => { if (!v) setPreviewAsset(null); }}
      />
      <PresaleQuickSendDialog
        asset={sendAsset}
        open={!!sendAsset}
        onOpenChange={(v) => { if (!v) setSendAsset(null); }}
      />
    </div>
  );
}

// ===================================================================
// Rail primitives
// ===================================================================
function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1.5 mb-1">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RailItem({
  icon, label, count, active, onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px] transition-colors',
        active
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-foreground/80 hover:bg-muted',
      )}
    >
      <span className="flex items-center gap-2 truncate">
        {icon}
        <span className="truncate capitalize">{label}</span>
      </span>
      {typeof count === 'number' && (
        <span className={cn('text-[10px]', active ? 'text-primary' : 'text-muted-foreground')}>{count}</span>
      )}
    </button>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold uppercase tracking-wider">
      {label}
      <button onClick={onClear} className="hover:opacity-70" aria-label="Clear filter">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

// ===================================================================
// Unified card (works for both local + Presale)
// ===================================================================
function UnifiedCard({
  item, selected, onSelect, onEdit, onToggleFav, onDelete, onDuplicate,
  onPromote, onPullToMine, onPreviewPresale, onSendPresale,
}: {
  item: UnifiedTemplate;
  selected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onToggleFav?: () => void;
  onDelete?: () => void;
  onDuplicate: () => void;
  onPromote?: () => void;
  onPullToMine?: () => void;
  onPreviewPresale?: () => void;
  onSendPresale?: () => void;
}) {
  const scope = unifiedScopeLabel(item);
  const cat = unifiedCategory(item);
  const tags = unifiedTags(item).slice(0, 3);
  const isFav = item.kind === 'local' && item.tpl.is_favorite;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'p-3 cursor-pointer transition-all flex flex-col gap-2',
        selected
          ? 'border-primary ring-1 ring-primary/40 shadow-sm'
          : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isFav && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
            <div className="font-semibold text-[13.5px] truncate">{unifiedName(item)}</div>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {CATEGORY_LABELS[cat] ?? cat}
          </div>
        </div>
        <ScopeBadge tone={scope.tone} label={scope.label} />
      </div>

      {unifiedSubject(item) && (
        <div className="text-xs text-foreground/80 truncate">
          <span className="text-muted-foreground">Subject: </span>{unifiedSubject(item)}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5 h-4">{t}</Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-1.5 border-t border-border/50">
        <div className="text-[10px] text-muted-foreground truncate">
          {item.kind === 'local'
            ? `Used ${item.tpl.times_used}× · ${new Date(item.tpl.updated_at).toLocaleDateString()}`
            : 'Live from Presale'}
        </div>

        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {item.kind === 'local' && onEdit && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onEdit}>
              <Pencil className="w-3 h-3 mr-1" /> Edit
            </Button>
          )}
          {item.kind === 'presale' && onSendPresale && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onSendPresale}>
              <Send className="w-3 h-3 mr-1" /> Send
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onDuplicate}>
                <CopyIcon className="w-3.5 h-3.5 mr-2" />
                {item.kind === 'local' ? 'Duplicate' : 'Clone to library'}
              </DropdownMenuItem>
              {onPromote && (
                <DropdownMenuItem onClick={onPromote}>
                  <Users className="w-3.5 h-3.5 mr-2" /> Share with team
                </DropdownMenuItem>
              )}
              {onPullToMine && (
                <DropdownMenuItem onClick={onPullToMine}>
                  <User className="w-3.5 h-3.5 mr-2" /> Move to my library
                </DropdownMenuItem>
              )}
              {onToggleFav && (
                <DropdownMenuItem onClick={onToggleFav}>
                  <Star className={cn('w-3.5 h-3.5 mr-2', isFav && 'fill-amber-400 text-amber-400')} />
                  {isFav ? 'Unfavorite' : 'Favorite'}
                </DropdownMenuItem>
              )}
              {onPreviewPresale && (
                <DropdownMenuItem onClick={onPreviewPresale}>
                  <Eye className="w-3.5 h-3.5 mr-2" /> Open preview
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function ScopeBadge({ tone, label }: { tone: 'gold' | 'team' | 'mine' | 'presale'; label: string }) {
  const styles: Record<string, string> = {
    gold: 'bg-primary/10 text-primary border-primary/20',
    team: 'bg-primary/10 text-primary border-primary/20',
    mine: 'bg-muted text-muted-foreground border-border',
    presale: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  };
  return (
    <span className={cn('text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 font-semibold', styles[tone])}>
      {label}
    </span>
  );
}

// ===================================================================
// Preview pane
// ===================================================================
function PreviewPane({
  item, onEdit, onClone, onSendPresale,
}: {
  item: UnifiedTemplate;
  onEdit?: () => void;
  onClone: () => void;
  onSendPresale?: () => void;
}) {
  const html = useMemo(() => renderWithSampleData(unifiedHtml(item)), [item]);
  const subject = unifiedSubject(item);

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/60 space-y-1 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="text-sm font-semibold truncate">{unifiedName(item)}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onEdit && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onEdit}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onClone}>
              <CopyIcon className="w-3 h-3" /> {item.kind === 'local' ? 'Duplicate' : 'Clone'}
            </Button>
            {onSendPresale && (
              <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={onSendPresale}>
                <Send className="w-3 h-3" /> Send
              </Button>
            )}
          </div>
        </div>
        {subject && (
          <div className="text-[11px] text-foreground/80 truncate">
            <span className="text-muted-foreground">Subject: </span>
            {renderWithSampleData(subject).replace(/<[^>]+>/g, '')}
          </div>
        )}
      </div>

      <div className="flex-1 bg-white overflow-hidden">
        <iframe
          title="Template preview"
          className="w-full h-full border-0"
          sandbox="allow-same-origin"
          srcDoc={`<html><head><style>body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;padding:20px;margin:0;background:#fff}img{max-width:100%}a{color:#D7A542}</style></head><body>${html || '<p style="color:#999">No content</p>'}</body></html>`}
        />
      </div>
    </Card>
  );
}

// ===================================================================
// Bridge sync pill (rail-friendly variant)
// ===================================================================
function BridgeStatusPill({
  isError, isFetching, updatedAt, onRefresh,
}: {
  isError: boolean;
  isFetching: boolean;
  updatedAt: number;
  onRefresh: () => void;
}) {
  const Icon = isError ? AlertCircle : isFetching ? RefreshCw : CheckCircle2;
  const label = isError
    ? 'Presale offline'
    : isFetching
      ? 'Syncing'
      : updatedAt
        ? 'Synced'
        : 'Idle';
  const tone = isError
    ? 'text-destructive border-destructive/30 bg-destructive/5'
    : 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      title="Click to refresh the Presale catalog"
      className={cn(
        'w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-[10.5px] font-semibold transition-colors hover:opacity-90',
        tone,
      )}
    >
      <Icon className={cn('h-3 w-3', isFetching && 'animate-spin')} />
      {label} · refresh
    </button>
  );
}

// ===================================================================
// Messaging panel (SMS only — WhatsApp removed per project constraint)
// ===================================================================
function MessagingPanel() {
  const { data: templates = [], isLoading } = useSmsTemplates();
  const smsTemplates = useMemo(
    () => templates.filter((t: any) => (t.channel || 'sms') === 'sms'),
    [templates],
  );
  if (isLoading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading templates…</Card>;
  }
  return (
    <Card className="p-6 text-center text-sm text-muted-foreground space-y-3">
      <div>SMS templates now live in the Messages workspace, with live preview, merge-tag picker, and "Send to me" testing.</div>
      <Button asChild size="sm" variant="outline">
        <Link to="/crm/sms">Open SMS templates →</Link>
      </Button>
      <div className="text-[11px]">{smsTemplates.length} template{smsTemplates.length === 1 ? '' : 's'} available</div>
    </Card>
  );
}
