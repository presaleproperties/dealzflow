import { useMemo, useState } from 'react';
import {
  Mail, MessageSquare, Plus, Search, FileText, Star, Pencil,
  Copy as CopyIcon, Trash2, Send, Eye, RefreshCw, AlertCircle,
  CheckCircle2, Sparkles, ArrowUpRight, Users, User, X, Filter,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
import { useSmsTemplates } from '@/hooks/useSms';
import { Link } from 'react-router-dom';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PresaleTemplatePreviewDialog } from '@/components/crm/marketing/PresaleTemplatePreviewDialog';
import { stripSignatureBlock } from '@/lib/templateSignature';
import { renderWithSampleData } from '@/lib/emailVariables';
import { AgentHubLinks } from '@/lib/agentHub';
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';

// ===================================================================
// Page shell
// ===================================================================
export default function CrmTemplatesPage() {
  const [tab, setTab] = useState<'email' | 'messaging'>('email');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border/60 px-4 sm:px-8 py-5 shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1">
              Library
            </div>
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight leading-none">
              Templates
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-xl">
              One library across your drafts, the team, and the live Presale catalog.
            </p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'messaging')}>
            <TabsList className="h-9 bg-muted/60 p-1">
              <TabsTrigger value="email" className="h-7 gap-1.5 text-xs px-3">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="messaging" className="h-7 gap-1.5 text-xs px-3">
                <MessageSquare className="w-3.5 h-3.5" /> SMS
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden"
        style={{ paddingBottom: 'var(--bottom-nav-pad, 0px)' }}
      >
        <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-8 py-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'messaging')} className="h-full flex flex-col">
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

  const agentSlug = usePresaleAgentStore((s) => s.agent?.slug ?? null);

  const openHub = (path: 'home' | 'new' | 'edit', tplKey?: string) => {
    const url =
      path === 'new'
        ? AgentHubLinks.newTemplate(agentSlug)
        : path === 'edit' && tplKey
        ? AgentHubLinks.editTemplate(tplKey, agentSlug)
        : AgentHubLinks.templates(agentSlug);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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

  const cloneToLibrary = (_asset: BridgeTemplate) => {
    // Cloning is now an Agent Hub action — the CRM library is read-only.
    openHub('home');
    toast.message('Open in Agent Hub to duplicate or remix this template.');
  };

  const isLoading = localQ.isLoading || bridgeQ.isLoading;
  const topTags = useMemo(
    () => [...counts.tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    [counts.tags],
  );

  const clearFilters = activeCategory || activeTag || search || scope !== 'all';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 h-full">
      {/* ======================== LEFT RAIL ======================== */}
      <aside className="hidden lg:flex flex-col gap-4 overflow-hidden">
        <div className="space-y-1.5">
          <Button size="sm" className="w-full gap-1.5 h-9 font-medium" onClick={() => { setCloneDraft(null); setCreating(true); }}>
            <Plus className="w-3.5 h-3.5" /> New template
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full gap-1.5 h-8 text-[12px] text-muted-foreground hover:text-foreground"
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
            placeholder="Search…"
            className="h-9 pl-8 text-[13px] bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-border"
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
            <RailItem label="All" count={counts.all} active={scope === 'all'} onClick={() => setScope('all')} />
            <RailItem label="Mine" count={counts.mine} active={scope === 'mine'} onClick={() => setScope('mine')} />
            <RailItem label="Team" count={counts.team} active={scope === 'team'} onClick={() => setScope('team')} />
            <RailItem label="Presale" count={counts.presale} active={scope === 'presale'} onClick={() => setScope('presale')} />
            <RailItem label="Favorites" count={counts.favorites} active={scope === 'favorites'} onClick={() => setScope('favorites')} />
          </RailSection>

          {Object.keys(counts.byCategory).length > 0 && (
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
          )}

          {topTags.length > 0 && (
            <RailSection title="Tags">
              <div className="flex flex-wrap gap-1 px-1.5">
                {topTags.map(([tag, n]) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      'text-[10.5px] px-1.5 py-0.5 rounded transition-colors',
                      activeTag === tag
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {tag.replace(/_/g, ' ')}<span className="opacity-50 ml-0.5">{n}</span>
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
      <main className="grid grid-cols-1 xl:grid-cols-[1fr_1.05fr] gap-6 overflow-hidden min-w-0">
        {/* Card grid */}
        <div className="flex flex-col overflow-hidden min-w-0">
          {/* Mobile toolbar */}
          <div className="lg:hidden flex items-center gap-2 mb-3">
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

          {/* Header row: count + active filters */}
          <div className="flex items-center justify-between gap-2 mb-3 min-h-[24px]">
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground/80">{filtered.length}</span>
              {filtered.length === 1 ? ' template' : ' templates'}
            </div>
            {clearFilters && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {scope !== 'all' && <FilterChip label={scope} onClear={() => setScope('all')} />}
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
                  className="text-[10.5px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex-1 grid grid-cols-1 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[68px] rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3 max-w-xs">
                <div className="w-10 h-10 mx-auto rounded-full bg-muted/60 flex items-center justify-center">
                  <Mail className="w-4 h-4 opacity-50" />
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {search || activeCategory || activeTag
                    ? 'Nothing matches those filters.'
                    : 'No templates yet.'}
                </div>
                <Button size="sm" variant="outline" onClick={() => { setCloneDraft(null); setCreating(true); }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> New template
                </Button>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="flex flex-col gap-1 pb-3">
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
        <aside className="hidden xl:flex flex-col overflow-hidden min-w-0">
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
            <div className="flex-1 rounded-lg border border-dashed border-border/60 flex items-center justify-center text-[12.5px] text-muted-foreground">
              Pick a template to preview
            </div>
          )}
        </aside>
      </main>

      {/* Editing happens in Agent Hub — no in-CRM editor */}

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
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/80 text-[10.5px]">
      {label}
      <button onClick={onClear} className="opacity-60 hover:opacity-100" aria-label="Clear filter">
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
    <div
      onClick={onSelect}
      className={cn(
        'group relative cursor-pointer rounded-lg px-3 py-2.5 transition-all border',
        selected
          ? 'border-primary/60 bg-primary/[0.04] shadow-[0_1px_0_0_hsl(var(--primary)/0.1)]'
          : 'border-transparent hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isFav && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
            <div className="font-medium text-[13.5px] truncate text-foreground">{unifiedName(item)}</div>
            <ScopeBadge tone={scope.tone} label={scope.label} />
          </div>
          {unifiedSubject(item) && (
            <div className="text-[12px] text-muted-foreground truncate">
              {unifiedSubject(item)}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10.5px] text-muted-foreground/80">
            <span className="uppercase tracking-wider">{CATEGORY_LABELS[cat] ?? cat}</span>
            {tags.length > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{tags.join(' · ')}</span>
              </>
            )}
            <span className="opacity-40">·</span>
            <span className="shrink-0">
              {item.kind === 'local'
                ? `Used ${item.tpl.times_used}×`
                : 'Live'}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 transition-opacity"
          data-selected={selected}
          onClick={(e) => e.stopPropagation()}
        >
          {item.kind === 'local' && onEdit && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
              <Pencil className="w-3.5 h-3.5" />
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
    </div>
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
    <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="px-4 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-0.5">
              Preview
            </div>
            <div className="text-[14px] font-semibold truncate text-foreground">{unifiedName(item)}</div>
            {subject && (
              <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                {renderWithSampleData(subject).replace(/<[^>]+>/g, '')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onEdit && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px]" onClick={onClone}>
              <CopyIcon className="w-3.5 h-3.5" /> {item.kind === 'local' ? 'Duplicate' : 'Clone'}
            </Button>
            {onSendPresale && (
              <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onSendPresale}>
                <Send className="w-3.5 h-3.5" /> Send
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-muted/20 overflow-hidden p-4">
        <div className="h-full rounded-md border border-border/60 bg-white overflow-hidden shadow-sm">
          <iframe
            title="Template preview"
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
            srcDoc={`<html><head><style>body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;padding:24px;margin:0;background:#fff}img{max-width:100%}a{color:#D7A542}</style></head><body>${html || '<p style="color:#999">No content</p>'}</body></html>`}
          />
        </div>
      </div>
    </div>
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
    ? 'text-destructive hover:bg-destructive/5'
    : 'text-muted-foreground hover:text-foreground hover:bg-muted';
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      title="Click to refresh the Presale catalog"
      className={cn(
        'w-full inline-flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-colors',
        tone,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          isError ? 'bg-destructive' : isFetching ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500',
        )} />
        Presale · {label}
      </span>
      <RefreshCw className={cn('h-3 w-3 opacity-60', isFetching && 'animate-spin')} />
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
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading templates…</div>;
  }
  return (
    <div className="max-w-md mx-auto mt-12 text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-muted/60 flex items-center justify-center">
        <MessageSquare className="w-5 h-5 opacity-50" />
      </div>
      <div className="space-y-1">
        <div className="text-[14px] font-medium text-foreground">SMS templates have moved</div>
        <div className="text-[12.5px] text-muted-foreground">
          They live in the Messages workspace with live preview, merge tags, and "Send to me" testing.
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/crm/sms">Open SMS templates →</Link>
      </Button>
      <div className="text-[11px] text-muted-foreground/70">
        {smsTemplates.length} template{smsTemplates.length === 1 ? '' : 's'} available
      </div>
    </div>
  );
}
