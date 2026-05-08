import { useMemo, useState } from 'react';
import {
  Mail, MessageSquare, Search, Send, X, ExternalLink, Pencil, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useEmailTemplates,
  useSoftDeleteEmailTemplate,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { useBridgeTemplates, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { useSmsTemplates } from '@/hooks/useSms';
import { Link } from 'react-router-dom';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import { PresaleTemplatePreviewDialog } from '@/components/crm/marketing/PresaleTemplatePreviewDialog';
import { renderWithSampleData } from '@/lib/emailVariables';
import { openAgentHub } from '@/lib/agentHub';

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
              Read-only mirror of your Agent Hub library. Build & edit templates in Agent Hub.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <OpenAgentHubButton />
          </div>
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

function OpenAgentHubButton() {
  return (
    <Button
      size="sm"
      className="gap-1.5 h-9"
      onClick={() => openAgentHub('/dashboard/email-builder')}
      title="One-click sign-in to Presale Agent Hub"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Open Agent Hub</span>
    </Button>
  );
}

// ===================================================================
// Email panel — slim list + preview
// ===================================================================

type SourceFilter = 'all' | 'mine' | 'presale';

type UnifiedTemplate =
  | { kind: 'local'; id: string; tpl: EmailTemplate }
  | { kind: 'presale'; id: string; asset: BridgeTemplate };

function unifiedName(u: UnifiedTemplate): string {
  return u.kind === 'local' ? u.tpl.name : u.asset.name;
}
function unifiedSubject(u: UnifiedTemplate): string | null {
  return u.kind === 'local' ? u.tpl.subject : u.asset.subject ?? null;
}
function unifiedHtml(u: UnifiedTemplate): string {
  return u.kind === 'local' ? u.tpl.html_content : u.asset.body_html ?? '';
}

function EmailTemplatesPanel() {
  const localQ = useEmailTemplates();
  const bridgeQ = useBridgeTemplates();
  const softDelete = useSoftDeleteEmailTemplate();

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);
  const [previewAsset, setPreviewAsset] = useState<BridgeTemplate | null>(null);
  const [sendAsset, setSendAsset] = useState<BridgeTemplate | null>(null);

  const openHubEdit = (_key?: string) => {
    // Deep-link to specific template is a v2; for now just open the builder.
    openAgentHub('/dashboard/email-builder');
  };

  const all: UnifiedTemplate[] = useMemo(() => {
    const items: UnifiedTemplate[] = [];
    for (const tpl of localQ.data ?? []) items.push({ kind: 'local', id: `l-${tpl.id}`, tpl });
    for (const asset of (bridgeQ.data ?? []).filter((a) => a.asset_type === 'email')) {
      items.push({ kind: 'presale', id: `p-${asset.id}`, asset });
    }
    return items;
  }, [localQ.data, bridgeQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((u) => {
      if (source === 'mine' && u.kind !== 'local') return false;
      if (source === 'presale' && u.kind !== 'presale') return false;
      if (q) {
        const hay = `${unifiedName(u)} ${unifiedSubject(u) ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, search, source]);

  const selected = useMemo(() => {
    if (selectedKey) {
      const found = filtered.find((u) => u.id === selectedKey);
      if (found) return found;
    }
    return filtered[0] ?? null;
  }, [filtered, selectedKey]);

  const isLoading = localQ.isLoading || bridgeQ.isLoading;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.05fr] gap-6 h-full overflow-hidden min-w-0">
      {/* List */}
      <div className="flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
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
                aria-label="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md shrink-0">
            {(['all', 'mine', 'presale'] as SourceFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  'h-8 px-2.5 text-[12px] rounded capitalize transition-colors',
                  source === s
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground mb-2 min-h-[16px]">
          <span className="font-semibold text-foreground/80">{filtered.length}</span>
          {filtered.length === 1 ? ' template' : ' templates'}
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[60px] rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-xs">
              <div className="w-10 h-10 mx-auto rounded-full bg-muted/60 flex items-center justify-center">
                <Mail className="w-4 h-4 opacity-50" />
              </div>
              <div className="text-[13px] text-muted-foreground">
                {search ? 'Nothing matches your search.' : 'No templates yet.'}
              </div>
              <Button size="sm" variant="outline" onClick={() => openHubEdit()}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open Agent Hub
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mr-2 pr-2">
            <div className="flex flex-col gap-1 pb-3">
              {filtered.map((u) => (
                <Row
                  key={u.id}
                  item={u}
                  selected={selected?.id === u.id}
                  onSelect={() => setSelectedKey(u.id)}
                  onEdit={u.kind === 'local' ? () => openHubEdit(u.tpl.id) : undefined}
                  onDelete={u.kind === 'local' ? () => setPendingDelete(u.tpl) : undefined}
                  onSend={u.kind === 'presale' ? () => setSendAsset(u.asset) : undefined}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Preview */}
      <aside className="hidden xl:flex flex-col overflow-hidden min-w-0">
        {selected ? (
          <PreviewPane
            item={selected}
            onEdit={selected.kind === 'local' ? () => openHubEdit(selected.tpl.id) : () => openHubEdit()}
            onSend={selected.kind === 'presale' ? () => setSendAsset(selected.asset) : undefined}
            onOpenInHubPresale={selected.kind === 'presale' ? () => setPreviewAsset(selected.asset) : undefined}
          />
        ) : (
          <div className="flex-1 rounded-lg border border-dashed border-border/60 flex items-center justify-center text-[12.5px] text-muted-foreground">
            Pick a template to preview
          </div>
        )}
      </aside>

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
// Row + Preview primitives
// ===================================================================
function Row({
  item, selected, onSelect, onEdit, onDelete, onSend,
}: {
  item: UnifiedTemplate;
  selected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSend?: () => void;
}) {
  const isPresale = item.kind === 'presale';
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative cursor-pointer rounded-lg px-3 py-2.5 transition-all border',
        selected
          ? 'border-primary/60 bg-primary/[0.04]'
          : 'border-transparent hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="font-medium text-[13.5px] truncate text-foreground">{unifiedName(item)}</div>
            <span className={cn(
              'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 font-semibold',
              isPresale
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-muted text-muted-foreground border-border',
            )}>
              {isPresale ? 'Presale' : 'Mine'}
            </span>
          </div>
          {unifiedSubject(item) && (
            <div className="text-[12px] text-muted-foreground truncate">
              {unifiedSubject(item)}
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 transition-opacity"
          data-selected={selected}
          onClick={(e) => e.stopPropagation()}
        >
          {onSend && (
            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={onSend}>
              <Send className="w-3 h-3 mr-1" /> Send
            </Button>
          )}
          {onEdit && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit in Agent Hub">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Archive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  item, onEdit, onSend, onOpenInHubPresale,
}: {
  item: UnifiedTemplate;
  onEdit?: () => void;
  onSend?: () => void;
  onOpenInHubPresale?: () => void;
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
            {onOpenInHubPresale && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onOpenInHubPresale}>
                Open
              </Button>
            )}
            {onEdit && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onEdit}>
                <ExternalLink className="w-3.5 h-3.5" /> Edit in Hub
              </Button>
            )}
            {onSend && (
              <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onSend}>
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
