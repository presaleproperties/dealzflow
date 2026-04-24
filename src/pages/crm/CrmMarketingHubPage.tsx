import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, FileText, Plus, ChevronRight, Building2, Star, Megaphone, Share2, Search, X, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useBridgeTemplates, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { PresaleTemplateCard } from '@/components/crm/marketing/PresaleTemplateCard';
import { PresaleTemplatePreviewDialog } from '@/components/crm/marketing/PresaleTemplatePreviewDialog';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import { inferTemplateTags, countTags, TEMPLATE_TAG_ORDER, type TemplateTag } from '@/lib/templateTags';

const CREATE_OPTIONS = [
  {
    key: 'project-email',
    title: 'Project Email',
    desc: 'Hero image, stats, highlights, floor plans',
    icon: Building2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    badge: 'Most Used',
    to: '/crm/email-builder?template=project-email',
  },
  {
    key: 'exclusive-offer',
    title: 'Exclusive Offer',
    desc: 'High-urgency promo with incentive spotlight',
    icon: Star,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    badge: 'Promo',
    to: '/crm/email-builder?template=exclusive-offer',
  },
  {
    key: 'blank-email',
    title: 'Blank Email',
    desc: 'Start from scratch',
    icon: Mail,
    color: 'text-muted-foreground',
    bg: 'bg-muted/40',
    badge: null,
    to: '/crm/email-builder?template=blank',
  },
];

/**
 * Marketing Hub — exact visual & UX mirror of Presale Properties'
 * /admin/marketing-hub. Templates are pulled live (read-only) from Presale
 * via the bridge-templates edge function. Authoring lives in Presale's
 * builder; in the CRM we Preview + Quick-Send.
 */
export default function CrmMarketingHubPage() {
  const { data: templates = [], isLoading, isFetching, dataUpdatedAt, refetch, isError } = useBridgeTemplates();
  const [activeTab, setActiveTab] = useState<'emails' | 'flyers' | 'social'>('emails');
  const [sendAsset, setSendAsset] = useState<BridgeTemplate | null>(null);
  const [previewAsset, setPreviewAsset] = useState<BridgeTemplate | null>(null);
  const [activeTags, setActiveTags] = useState<Set<TemplateTag>>(new Set());
  const [search, setSearch] = useState('');

  // Bridge returns a unified library; we partition by asset_type so each tab
  // shows the right slice of synced content from Presale.
  const emailAssets = useMemo(() => templates.filter((t) => t.asset_type === 'email'), [templates]);
  const flyerAssets = useMemo(() => templates.filter((t) => t.asset_type === 'flyer'), [templates]);
  const socialAssets = useMemo(() => templates.filter((t) => t.asset_type === 'social'), [templates]);

  const tagCounts = useMemo(() => countTags(emailAssets), [emailAssets]);

  const baseAssets =
    activeTab === 'emails' ? emailAssets : activeTab === 'flyers' ? flyerAssets : socialAssets;

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseAssets.filter((t) => {
      // Tag filter (OR across selected tags)
      if (activeTags.size > 0) {
        const tags = inferTemplateTags(t);
        if (!tags.some((tg) => activeTags.has(tg))) return false;
      }
      // Search filter
      if (q) {
        const hay = `${t.name ?? ''} ${t.subject ?? ''} ${t.category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseAssets, activeTags, search]);

  const toggleTag = (tag: TemplateTag) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };
  const clearFilters = () => { setActiveTags(new Set()); setSearch(''); };
  const hasFilters = activeTags.size > 0 || search.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-background -mx-2 sm:-mx-0">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-5 shrink-0">
        <div className="flex items-center justify-between max-w-5xl mx-auto gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Megaphone className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">Marketing Hub</h1>
              <p className="text-xs text-muted-foreground truncate">
                Native email composer · templates synced via bridge
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SyncPill
              isError={isError}
              isFetching={isFetching}
              dataUpdatedAt={dataUpdatedAt}
              onRefetch={() => refetch()}
            />
            <Badge variant="outline" className="text-[11px] px-2.5 py-1">
              {emailAssets.length + flyerAssets.length + socialAssets.length} saved
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-8">
          {/* Create new */}
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Create New
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CREATE_OPTIONS.map((opt) => (
                <Link
                  key={opt.key}
                  to={opt.to}
                  className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/30 transition-all text-left"
                >
                  <div
                    className={cn(
                      'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                      opt.bg,
                    )}
                  >
                    <opt.icon className={cn('h-[18px] w-[18px]', opt.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold">{opt.title}</span>
                      {opt.badge && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 py-0">
                          {opt.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Composer is built into the CRM · saved templates sync to the shared library automatically
            </p>
          </section>

          {/* Saved work */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {activeTab === 'emails'
                  ? 'Email Templates'
                  : activeTab === 'flyers'
                    ? 'Print Flyers'
                    : 'Social Posts'}
              </p>
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                {(['emails', 'flyers', 'social'] as const).map((tab) => {
                  const count =
                    tab === 'emails'
                      ? emailAssets.length
                      : tab === 'flyers'
                        ? flyerAssets.length
                        : socialAssets.length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'px-3 py-1 text-[11px] font-semibold rounded-md transition-all capitalize',
                        activeTab === tab
                          ? 'bg-card shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab === 'social' ? (
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3 w-3" /> Social ({count})
                        </span>
                      ) : (
                        <>
                          {tab} ({count})
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search + tag filter row (emails tab only) */}
            {activeTab === 'emails' && emailAssets.length > 0 && (
              <div className="mb-4 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates by name, subject, or category…"
                    className="pl-9 h-9 text-sm"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {TEMPLATE_TAG_ORDER.filter((tag) => tagCounts[tag] > 0).map((tag) => {
                    const active = activeTags.has(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all',
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
                        )}
                      >
                        {tag}
                        <span className={cn(
                          'text-[10px] px-1 rounded',
                          active ? 'bg-primary-foreground/20' : 'bg-muted',
                        )}>{tagCounts[tag]}</span>
                      </button>
                    );
                  })}
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {filteredAssets.length} of {emailAssets.length}
                  </span>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/30 animate-pulse">
                    <div className="h-44 bg-muted/50 rounded-t-xl" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-muted/50 rounded w-3/4" />
                      <div className="h-3 bg-muted/50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAssets.length === 0 ? (
              hasFilters && activeTab === 'emails' ? (
                <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl text-center">
                  <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No templates match these filters</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 mb-4">Try a different tag or clear the search.</p>
                  <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </Button>
                </div>
              ) : (
                <EmptyState
                  icon={activeTab === 'emails' ? Mail : activeTab === 'flyers' ? FileText : Share2}
                  title={`No ${activeTab} synced yet`}
                  description={
                    activeTab === 'emails'
                      ? 'Compose one in the native CRM email builder — it will be saved to the shared template library.'
                      : activeTab === 'flyers'
                        ? 'Print flyers tagged "flyer" in the shared library will appear here automatically.'
                        : 'Social posts tagged "social" in the shared library will appear here automatically.'
                  }
                  ctaTo={activeTab === 'emails' ? '/crm/email-builder' : null}
                  ctaLabel={`Create ${activeTab === 'emails' ? 'Email' : activeTab === 'flyers' ? 'Flyer' : 'Social Post'}`}
                  onRefetch={() => refetch()}
                  isFetching={isFetching}
                />
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssets.map((asset) => (
                  <PresaleTemplateCard
                    key={asset.id}
                    asset={asset}
                    onSend={setSendAsset}
                    onPreview={setPreviewAsset}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <PresaleQuickSendDialog
        asset={sendAsset}
        open={!!sendAsset}
        onOpenChange={(v) => {
          if (!v) setSendAsset(null);
        }}
      />
      <PresaleTemplatePreviewDialog
        asset={previewAsset}
        open={!!previewAsset}
        onOpenChange={(v) => {
          if (!v) setPreviewAsset(null);
        }}
      />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  ctaTo,
  ctaLabel,
  onRefetch,
  isFetching,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  ctaTo: string | null;
  ctaLabel: string;
  onRefetch: () => void;
  isFetching: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl text-center">
      <Icon className="h-10 w-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/60 mt-1 mb-4 max-w-xs">{description}</p>
      <div className="flex items-center gap-2">
        {ctaTo && (
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to={ctaTo}>
              <Plus className="h-3.5 w-3.5" />
              {ctaLabel}
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onRefetch} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Re-sync
        </Button>
      </div>
    </div>
  );
}

function SyncPill({
  isError,
  isFetching,
  dataUpdatedAt,
  onRefetch,
}: {
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  onRefetch: () => void;
}) {
  const label = isError
    ? 'Bridge offline'
    : isFetching
      ? 'Syncing…'
      : dataUpdatedAt
        ? `Synced ${formatRelative(dataUpdatedAt)}`
        : 'Idle';
  const Icon = isError ? AlertCircle : isFetching ? RefreshCw : CheckCircle2;
  const tone = isError
    ? 'text-destructive border-destructive/30 bg-destructive/5'
    : 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
  return (
    <button
      type="button"
      onClick={onRefetch}
      disabled={isFetching}
      title="Bridge sync status — click to refresh"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors hover:opacity-90',
        tone,
      )}
    >
      <Icon className={cn('h-3 w-3', isFetching && 'animate-spin')} />
      {label}
    </button>
  );
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
