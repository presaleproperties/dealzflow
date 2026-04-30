import { useMemo, useState } from 'react';
import {
  Mail, MessageSquare, Plus, Search, FileText, Star, Pencil, Copy as CopyIcon,
  Trash2, MoreHorizontal, Send, Eye, ExternalLink, RefreshCw, AlertCircle, CheckCircle2,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  useEmailTemplates,
  useSoftDeleteEmailTemplate,
  useToggleFavorite,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { useBridgeTemplates, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { TemplateEditor } from '@/components/crm/templates/TemplateEditor';
import { useSmsTemplates, type MessagingChannel } from '@/hooks/useSms';
import { Link } from 'react-router-dom';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PresaleTemplatePreviewDialog } from '@/components/crm/marketing/PresaleTemplatePreviewDialog';
import { stripSignatureBlock } from '@/lib/templateSignature';

// ===================================================================
// Page shell
// ===================================================================
export default function CrmTemplatesPage() {
  const [tab, setTab] = useState<'email' | 'messaging'>('email');

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-br from-card via-card to-muted/30 px-4 sm:px-6 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Templates</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                One library — your templates, your team's templates, and the live Presale Properties catalog.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'var(--bottom-nav-pad, 0px)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'messaging')} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="messaging" className="gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> SMS
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-0">
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
// Unified Email panel — local library + live Presale catalog
// ===================================================================

type SourceFilter = 'all' | 'mine' | 'presale';

type UnifiedTemplate =
  | { kind: 'local'; id: string; tpl: EmailTemplate }
  | { kind: 'presale'; id: string; asset: BridgeTemplate };

function EmailTemplatesPanel() {
  const localQ = useEmailTemplates();
  const bridgeQ = useBridgeTemplates();

  const softDelete = useSoftDeleteEmailTemplate();
  const toggleFav = useToggleFavorite();

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloneDraft, setCloneDraft] = useState<{
    name: string; subject: string | null; html_content: string; category: string;
    project_tags: string[]; area_tags: string[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);
  const [previewAsset, setPreviewAsset] = useState<BridgeTemplate | null>(null);
  const [sendAsset, setSendAsset] = useState<BridgeTemplate | null>(null);

  const localTemplates = localQ.data ?? [];
  const presaleAssets = (bridgeQ.data ?? []).filter((a) => a.asset_type === 'email');

  const unified: UnifiedTemplate[] = useMemo(() => {
    const items: UnifiedTemplate[] = [];
    if (source === 'all' || source === 'mine') {
      for (const tpl of localTemplates) items.push({ kind: 'local', id: `l-${tpl.id}`, tpl });
    }
    if (source === 'all' || source === 'presale') {
      for (const asset of presaleAssets) items.push({ kind: 'presale', id: `p-${asset.id}`, asset });
    }
    return items;
  }, [localTemplates, presaleAssets, source]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unified;
    return unified.filter((row) => {
      const hay =
        row.kind === 'local'
          ? `${row.tpl.name} ${row.tpl.subject ?? ''} ${row.tpl.category} ${(row.tpl.project_tags ?? []).join(' ')}`
          : `${row.asset.name} ${row.asset.subject ?? ''} ${row.asset.category ?? ''} ${(row.asset.tags_raw ?? []).join(' ')}`;
      return hay.toLowerCase().includes(q);
    });
  }, [unified, search]);

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
  const counts = {
    all: localTemplates.length + presaleAssets.length,
    mine: localTemplates.length,
    presale: presaleAssets.length,
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search across all templates…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        <SourceTabs source={source} onChange={setSource} counts={counts} />

        <div className="ml-auto flex items-center gap-2">
          <BridgeStatusPill
            isError={bridgeQ.isError}
            isFetching={bridgeQ.isFetching}
            updatedAt={bridgeQ.dataUpdatedAt}
            onRefresh={() => bridgeQ.refetch()}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const t = toast.loading('Pulling latest from Presale…');
              try {
                const { data, error } = await supabase.functions.invoke('sync-bridge-templates', { body: {} });
                if (error) throw error;
                if ((data as any)?.skipped === 'presale_sync_disabled') {
                  toast.message('Presale template sync isn\'t live yet', {
                    id: t,
                    description: 'Your local templates work fine. Two-way sync turns on once Presale ships their endpoints.',
                  });
                } else {
                  await Promise.all([localQ.refetch(), bridgeQ.refetch()]);
                  toast.success('Templates synced from Presale', { id: t });
                }
              } catch (e: any) {
                toast.error(e?.message || 'Sync failed', { id: t });
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync now
          </Button>
          <Button size="sm" onClick={() => { setCloneDraft(null); setCreating(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New template
          </Button>
        </div>
      </div>

      {/* Listing */}
      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading templates…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Mail className="w-7 h-7 mx-auto opacity-40" />
          <div className="text-sm text-muted-foreground">
            {search
              ? 'No templates match your search.'
              : source === 'presale'
                ? 'No Presale templates synced yet — they appear here automatically.'
                : 'No templates yet — start with one of yours or clone a Presale template.'}
          </div>
          {!search && source !== 'presale' && (
            <Button size="sm" variant="outline" onClick={() => { setCloneDraft(null); setCreating(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create your first template
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((row) =>
            row.kind === 'local' ? (
              <LocalTemplateCard
                key={row.id}
                tpl={row.tpl}
                onEdit={() => setEditing(row.tpl)}
                onToggleFav={() => toggleFav.mutate({ id: row.tpl.id, is_favorite: !row.tpl.is_favorite })}
                onDelete={() => setPendingDelete(row.tpl)}
              />
            ) : (
              <PresaleAssetCard
                key={row.id}
                asset={row.asset}
                onPreview={() => setPreviewAsset(row.asset)}
                onSend={() => setSendAsset(row.asset)}
                onClone={() => cloneToLibrary(row.asset)}
              />
            ),
          )}
        </div>
      )}

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

      {/* Presale preview & send */}
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
// Source tabs (Mine / Presale / All)
// ===================================================================
function SourceTabs({
  source, onChange, counts,
}: {
  source: SourceFilter;
  onChange: (s: SourceFilter) => void;
  counts: { all: number; mine: number; presale: number };
}) {
  const items: Array<{ id: SourceFilter; label: string }> = [
    { id: 'all', label: `All (${counts.all})` },
    { id: 'mine', label: `Mine (${counts.mine})` },
    { id: 'presale', label: `Presale (${counts.presale})` },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            'px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap',
            source === it.id
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ===================================================================
// Cards
// ===================================================================
function LocalTemplateCard({
  tpl, onEdit, onToggleFav, onDelete,
}: {
  tpl: EmailTemplate;
  onEdit: () => void;
  onToggleFav: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-3 hover:border-primary/40 transition-colors flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate flex items-center gap-1.5">
            {tpl.is_favorite && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
            {tpl.name}
            {tpl.owner_scope === 'team:presale' ? (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">Team</span>
            ) : tpl.owner_scope?.startsWith('agent:') ? (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border shrink-0">Mine</span>
            ) : null}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {tpl.category}{tpl.source && tpl.source !== 'dealflow' ? ` · ${tpl.source}` : ''}
          </div>
        </div>
        {/* Always-visible actions menu (touch friendly) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleFav}>
              <Star className={cn('w-3.5 h-3.5 mr-2', tpl.is_favorite && 'fill-amber-400 text-amber-400')} />
              {tpl.is_favorite ? 'Unfavorite' : 'Favorite'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {tpl.subject && (
        <div className="text-xs text-foreground/80 truncate">
          <span className="text-muted-foreground">Subject: </span>{tpl.subject}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {(tpl.project_tags ?? []).slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-[9px] py-0 px-1.5 h-4">{tag}</Badge>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/50">
        <div className="text-[10px] text-muted-foreground">
          Used {tpl.times_used}× · {new Date(tpl.updated_at).toLocaleDateString()}
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onEdit}>
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
      </div>
    </Card>
  );
}

function PresaleAssetCard({
  asset, onPreview, onSend, onClone,
}: {
  asset: BridgeTemplate;
  onPreview: () => void;
  onSend: () => void;
  onClone: () => void;
}) {
  return (
    <Card className="p-3 hover:border-primary/40 transition-colors flex flex-col gap-2 relative">
      {/* Source pip */}
      <span
        className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
        title="Live from Presale Properties — read-only"
      >
        Presale
      </span>

      <div className="min-w-0 pr-14">
        <div className="font-semibold text-sm truncate">{asset.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
          {asset.category || 'Presale Properties'}
        </div>
      </div>

      {asset.subject && (
        <div className="text-xs text-foreground/80 truncate">
          <span className="text-muted-foreground">Subject: </span>{asset.subject}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {(asset.tags_raw ?? []).slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-[9px] py-0 px-1.5 h-4">{tag}</Badge>
        ))}
      </div>

      <div className="flex items-center gap-1 mt-auto pt-1 border-t border-border/50">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onPreview}>
          <Eye className="w-3 h-3 mr-1" /> Preview
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onSend}>
          <Send className="w-3 h-3 mr-1" /> Send
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onClone}
          title="Copy this template into your library — your signature is added automatically.">
          <CopyIcon className="w-3 h-3 mr-1" /> Clone
        </Button>
      </div>
    </Card>
  );
}

// ===================================================================
// Bridge sync status pill
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
        'hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10.5px] font-semibold transition-colors hover:opacity-90',
        tone,
      )}
    >
      <Icon className={cn('h-3 w-3', isFetching && 'animate-spin')} />
      {label}
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
