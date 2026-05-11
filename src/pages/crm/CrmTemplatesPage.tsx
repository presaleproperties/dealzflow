import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail, MessageSquare, Search, Send, X, Star, StarOff, Plus, Folder,
  Pencil, Trash2, ExternalLink, Tag as TagIcon, Sparkles, FolderPlus,
  History, MoreHorizontal, Lock, Command as CommandIcon, Clock, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/crm/shared/Pill';
import { renderWithSampleData } from '@/lib/emailVariables';
import { useUnifiedTemplates, type UnifiedTemplate } from '@/hooks/useUnifiedTemplates';
import {
  useTemplateFolders, useCreateFolder, useDeleteFolder, useAddTemplateToFolder,
  useTemplateTags, useCreateTag, useToggleTagOnTemplate,
  useToggleFavoriteV2, useTemplateStatsMap, pushRecentTemplate, useRecentTemplates,
  type TemplateKind,
} from '@/hooks/useTemplateOrg';
import {
  useUpdateEmailTemplate, useCreateEmailTemplate, useSoftDeleteEmailTemplate,
  useChangeTemplateScope, useDuplicateTemplate,
} from '@/hooks/useEmailTemplates';
import { useSaveSmsTemplate, useDeleteSmsTemplate } from '@/hooks/useSms';
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { PresaleQuickSendDialog } from '@/components/crm/marketing/PresaleQuickSendDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { TemplateCommandPalette } from '@/components/crm/templates/TemplateCommandPalette';

const EMPTY_CONTACT: CrmContact = {
  id: '__pick__', first_name: '', last_name: '', email: null,
} as unknown as CrmContact;

// ===========================================================================
// Page
// ===========================================================================
export default function CrmTemplatesPage() {
  const mySlug = usePresaleAgentStore((s) => s.agent?.slug ?? null);
  const [channel, setChannel] = useState<'all' | 'email' | 'sms'>('all');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'all' | 'mine' | 'team' | 'presale'>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [favoritedOnly, setFavoritedOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [editing, setEditing] = useState<UnifiedTemplate | null>(null);
  const [creating, setCreating] = useState<null | { kind: TemplateKind }>(null);
  const [pendingDelete, setPendingDelete] = useState<UnifiedTemplate | null>(null);
  const [composeEmail, setComposeEmail] = useState<{ subject: string; html: string } | null>(null);
  const [composeSms, setComposeSms] = useState<{ body: string } | null>(null);
  const [sendPresale, setSendPresale] = useState<any | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sendTemplate = (t: UnifiedTemplate) => {
    pushRecentTemplate({ id: t.id, kind: t.kind });
    if (t.source === 'presale') setSendPresale(t.raw);
    else if (t.kind === 'email') setComposeEmail({ subject: t.subject ?? '', html: t.bodyHtml });
    else setComposeSms({ body: t.bodyText });
  };

  const { items, isLoading, tagsByTemplate } = useUnifiedTemplates({
    channel, search, source, folderId, tagIds, favoritedOnly, featuredOnly, myAgentSlug: mySlug,
  });

  const selected = useMemo(() => {
    if (selectedUid) {
      const f = items.find((u) => u.uid === selectedUid);
      if (f) return f;
    }
    return items[0] ?? null;
  }, [items, selectedUid]);

  const totalFavs = items.filter((i) => i.isFavorite).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/60 px-4 sm:px-8 py-4 shrink-0">
        <div className="max-w-[1500px] mx-auto flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1">
              Library
            </div>
            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight leading-none">
              Templates
            </h1>
            <p className="text-[12.5px] text-muted-foreground mt-1.5">
              {items.length} template{items.length === 1 ? '' : 's'}
              {totalFavs > 0 ? ` · ${totalFavs} favorite${totalFavs === 1 ? '' : 's'}` : ''}
              {' · shared with the whole team'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-[12.5px] hidden sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
              title="Quick find (⌘K)"
            >
              <Search className="w-3.5 h-3.5" />
              Quick find
              <kbd className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground border border-border/60 rounded px-1 py-0.5">
                <CommandIcon className="w-2.5 h-2.5" />K
              </kbd>
            </Button>
            <ChannelToggle channel={channel} onChange={setChannel} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 gap-1.5">
                  <Plus className="w-4 h-4" /> New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setCreating({ kind: 'email' })}>
                  <Mail className="w-3.5 h-3.5 mr-2" /> Email template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreating({ kind: 'sms' })}>
                  <MessageSquare className="w-3.5 h-3.5 mr-2" /> SMS template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-hidden"
        style={{ paddingBottom: 'var(--bottom-nav-pad, 0px)' }}
      >
        <div className="max-w-[1500px] mx-auto h-full grid grid-cols-1 lg:grid-cols-[220px_1fr_minmax(0,1.05fr)] gap-0 lg:gap-6 px-4 sm:px-8 py-5 min-h-0">
          {/* Rail */}
          <aside className="hidden lg:block min-h-0 overflow-hidden">
            <TemplateRail
              source={source}
              setSource={setSource}
              folderId={folderId}
              setFolderId={setFolderId}
              tagIds={tagIds}
              setTagIds={setTagIds}
              favoritedOnly={favoritedOnly}
              setFavoritedOnly={setFavoritedOnly}
              featuredOnly={featuredOnly}
              setFeaturedOnly={setFeaturedOnly}
            />
          </aside>

          {/* Grid */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, subject, body, or category…"
                  className="h-9 pl-8 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <MobileFilterButton
                source={source} setSource={setSource}
                favoritedOnly={favoritedOnly} setFavoritedOnly={setFavoritedOnly}
                featuredOnly={featuredOnly} setFeaturedOnly={setFeaturedOnly}
              />
            </div>

            {/* Active filter chips */}
            <ActiveFilterRow
              folderId={folderId} clearFolder={() => setFolderId(null)}
              tagIds={tagIds} setTagIds={setTagIds}
              favoritedOnly={favoritedOnly} clearFav={() => setFavoritedOnly(false)}
              featuredOnly={featuredOnly} clearFeat={() => setFeaturedOnly(false)}
              source={source} clearSource={() => setSource('all')}
            />

            {isLoading ? (
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[300px] rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState onCreate={() => setCreating({ kind: 'email' })} hasSearch={!!search} />
            ) : (
              <ScrollArea className="flex-1 -mr-2 pr-2 mt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
                  {items.map((u) => (
                    <TemplateCard
                      key={u.uid}
                      item={u}
                      tagIds={tagsByTemplate.get(u.uid) ?? []}
                      selected={selected?.uid === u.uid}
                      onSelect={() => setSelectedUid(u.uid)}
                      onEdit={() => setEditing(u)}
                      onSend={() => sendTemplate(u)}
                      onDelete={() => setPendingDelete(u)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Preview */}
          <aside className="hidden lg:flex flex-col min-h-0 overflow-hidden">
            {selected ? (
              <PreviewPane
                item={selected}
                onEdit={() => setEditing(selected)}
                onDelete={() => setPendingDelete(selected)}
                onSend={() => {
                  pushRecentTemplate({ id: selected.id, kind: selected.kind });
                  if (selected.source === 'presale') {
                    setSendPresale(selected.raw);
                  } else if (selected.kind === 'email') {
                    setComposeEmail({ subject: selected.subject ?? '', html: selected.bodyHtml });
                  } else {
                    setComposeSms({ body: selected.bodyText });
                  }
                }}
              />
            ) : (
              <div className="flex-1 rounded-lg border border-dashed border-border/60 flex items-center justify-center text-[12.5px] text-muted-foreground">
                Pick a template to preview
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Editor / creator */}
      {editing && (
        <TemplateEditorDrawer
          mode="edit"
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && (
        <TemplateEditorDrawer
          mode="create"
          kind={creating.kind}
          onClose={() => setCreating(null)}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The template is hidden from the library. Sent messages aren't affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <ArchiveButton item={pendingDelete} onDone={() => setPendingDelete(null)} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {composeEmail && (
        <ComposeEmailDialog
          contact={EMPTY_CONTACT}
          open
          onOpenChange={(o) => { if (!o) setComposeEmail(null); }}
          initialSubject={composeEmail.subject}
          initialBodyHtml={composeEmail.html}
          onPickContact={() => {}}
        />
      )}
      {composeSms && (
        <SendTextLauncherDialog
          initialBody={composeSms.body}
          onClose={() => setComposeSms(null)}
        />
      )}
      <PresaleQuickSendDialog
        asset={sendPresale}
        open={!!sendPresale}
        onOpenChange={(v) => { if (!v) setSendPresale(null); }}
      />

      <TemplateCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        templates={items}
        onPreview={(t) => setSelectedUid(t.uid)}
        onSend={(t) => { sendTemplate(t); }}
        onEdit={(t) => setEditing(t)}
      />
    </div>
  );
}

// ===========================================================================
// Channel toggle
// ===========================================================================
function ChannelToggle({ channel, onChange }: { channel: 'all' | 'email' | 'sms'; onChange: (c: any) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
      {([
        { v: 'all', label: 'All', icon: null as null | typeof Mail },
        { v: 'email', label: 'Email', icon: Mail },
        { v: 'sms', label: 'SMS', icon: MessageSquare },
      ] as const).map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.v}
            onClick={() => onChange(opt.v)}
            className={cn(
              'h-8 px-2.5 text-[12px] rounded inline-flex items-center gap-1 transition-colors',
              channel === opt.v
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Rail
// ===========================================================================
function TemplateRail(props: {
  source: any; setSource: (s: any) => void;
  folderId: string | null; setFolderId: (s: string | null) => void;
  tagIds: string[]; setTagIds: (t: string[]) => void;
  favoritedOnly: boolean; setFavoritedOnly: (b: boolean) => void;
  featuredOnly: boolean; setFeaturedOnly: (b: boolean) => void;
}) {
  const { data: folders = [] } = useTemplateFolders();
  const { data: tags = [] } = useTemplateTags();
  const recents = useRecentTemplates();
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const createTag = useCreateTag();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');

  return (
    <ScrollArea className="h-full pr-2">
      <div className="space-y-5 text-[13px]">
        <RailGroup label="Quick">
          <RailItem
            active={props.favoritedOnly}
            onClick={() => props.setFavoritedOnly(!props.favoritedOnly)}
            icon={<Star className="w-3.5 h-3.5" />}
          >
            Favorites
          </RailItem>
          <RailItem
            active={props.featuredOnly}
            onClick={() => props.setFeaturedOnly(!props.featuredOnly)}
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Featured
          </RailItem>
          {recents.length > 0 && (
            <div className="px-2 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">Recent</div>
          )}
        </RailGroup>

        <RailGroup label="Source">
          {(['all', 'mine', 'team'] as const).map((s) => (
            <RailItem key={s} active={props.source === s} onClick={() => props.setSource(s)}>
              <span className="capitalize">{s === 'all' ? 'All sources' : s}</span>
            </RailItem>
          ))}
        </RailGroup>

        <RailGroup
          label="Folders"
          action={
            <button
              onClick={() => setNewFolderOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="New folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          }
        >
          <RailItem active={!props.folderId} onClick={() => props.setFolderId(null)}>
            All
          </RailItem>
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              <RailItem
                active={props.folderId === f.id}
                onClick={() => props.setFolderId(f.id)}
                icon={<Folder className="w-3.5 h-3.5" />}
                className="flex-1"
              >
                {f.name}
              </RailItem>
              <button
                onClick={() => {
                  if (confirm(`Delete folder "${f.name}"?`)) deleteFolder.mutate(f.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                aria-label="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {folders.length === 0 && (
            <div className="px-2 text-[11px] text-muted-foreground">No folders yet.</div>
          )}
        </RailGroup>

        <RailGroup
          label="Tags"
          action={
            <button
              onClick={() => setNewTagOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="New tag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5 px-1">
            {tags.map((t) => {
              const on = props.tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    props.setTagIds(on ? props.tagIds.filter((x) => x !== t.id) : [...props.tagIds, t.id])
                  }
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded border transition-colors',
                    on
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
            {tags.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No tags yet.</div>
            )}
          </div>
        </RailGroup>
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Folders are visible to everyone on the team.</DialogDescription>
          </DialogHeader>
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. Showings" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!newFolderName.trim()) return;
                await createFolder.mutateAsync({ name: newFolderName });
                setNewFolderName('');
                setNewFolderOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newTagOpen} onOpenChange={setNewTagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>Tags are shared with the team and used to filter templates.</DialogDescription>
          </DialogHeader>
          <Input value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)} placeholder="e.g. mandarin" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewTagOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!newTagLabel.trim()) return;
                await createTag.mutateAsync({ label: newTagLabel });
                setNewTagLabel('');
                setNewTagOpen(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

function RailGroup({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2 mb-1">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function RailItem({ active, onClick, icon, children, className }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-[13px] transition-colors',
        active ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

// ===========================================================================
// Active filter row + Mobile filters
// ===========================================================================
function ActiveFilterRow(props: any) {
  const { data: folders = [] } = useTemplateFolders();
  const { data: tags = [] } = useTemplateTags();
  const folderName = folders.find((f) => f.id === props.folderId)?.name;
  const items: Array<{ key: string; label: string; clear: () => void }> = [];
  if (props.source !== 'all') items.push({ key: 'src', label: props.source, clear: props.clearSource });
  if (props.folderId && folderName) items.push({ key: 'folder', label: `📁 ${folderName}`, clear: props.clearFolder });
  if (props.favoritedOnly) items.push({ key: 'fav', label: 'Favorites', clear: props.clearFav });
  if (props.featuredOnly) items.push({ key: 'feat', label: 'Featured', clear: props.clearFeat });
  for (const tid of props.tagIds) {
    const t = tags.find((x) => x.id === tid);
    if (t) items.push({ key: `tag:${tid}`, label: `#${t.label}`, clear: () => props.setTagIds(props.tagIds.filter((x: string) => x !== tid)) });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-2">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={it.clear}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
        >
          {it.label} <X className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
}

function MobileFilterButton(props: any) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden h-9">Filters</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">Source</div>
            <div className="grid grid-cols-2 gap-1">
              {(['all', 'mine', 'team'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => props.setSource(s)}
                  className={cn(
                    'text-[12px] px-2 py-1.5 rounded border capitalize',
                    props.source === s ? 'bg-primary/10 border-primary/40' : 'bg-muted/30 border-border',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between text-[12px]">
            Favorites only
            <input type="checkbox" checked={props.favoritedOnly} onChange={(e) => props.setFavoritedOnly(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between text-[12px]">
            Featured only
            <input type="checkbox" checked={props.featuredOnly} onChange={(e) => props.setFeaturedOnly(e.target.checked)} />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ===========================================================================
// Card
// ===========================================================================
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  const src = m[1].trim();
  if (src.startsWith('cid:') || src.startsWith('data:image/svg')) return null;
  return src;
}

function timeAgoShort(dateStr?: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'just now';
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function TemplateCard({
  item, selected, onSelect, tagIds, onEdit, onSend, onDelete,
}: {
  item: UnifiedTemplate;
  selected: boolean;
  onSelect: () => void;
  tagIds: string[];
  onEdit: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  const toggleFav = useToggleFavoriteV2();
  const duplicateEmail = useDuplicateTemplate();
  const saveSms = useSaveSmsTemplate();
  const { map: statsMap } = useTemplateStatsMap();
  const { data: tags = [] } = useTemplateTags();
  const stats = statsMap.get(`${item.kind}:${item.id}`);
  const itemTags = tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as any[];

  const heroImage = useMemo(() => extractFirstImage(item.bodyHtml), [item.bodyHtml]);
  const editable = item.source !== 'presale' && !item.isLocked;
  const projectLabel = item.category && item.category !== 'general' ? item.category : null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const onDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.source === 'presale') { toast.info('Duplicate is disabled for Presale templates.'); return; }
    if (item.kind === 'email') {
      duplicateEmail.mutate(item.raw as any);
    } else {
      saveSms.mutate({ name: `${item.name} (Copy)`, body: item.bodyText } as any, {
        onSuccess: () => toast.success('Duplicated to your library'),
      });
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-xl border bg-card overflow-hidden transition-all cursor-pointer flex flex-col',
        selected ? 'border-primary/60 ring-1 ring-primary/30 shadow-sm' : 'border-border hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      {/* Hero */}
      <div className="relative h-44 bg-gradient-to-br from-muted/40 to-muted/10 overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
            onError={(e) => { (e.currentTarget.style.display = 'none'); }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {item.kind === 'email'
              ? <Mail className="w-10 h-10 text-muted-foreground/20" />
              : <MessageSquare className="w-10 h-10 text-muted-foreground/20" />}
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <Pill tone={item.kind === 'email' ? 'success' : 'neutral'} size="sm" className="shadow-sm">
            {item.kind === 'email' ? 'Email' : 'SMS'}
          </Pill>
          {item.isFeatured && <Pill tone="primary" size="sm" className="shadow-sm">Featured</Pill>}
          {item.isLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur text-muted-foreground shadow-sm">
              <Lock className="w-2.5 h-2.5" /> Locked
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFav.mutate({ templateId: item.id, kind: item.kind, on: !item.isFavorite });
          }}
          className={cn(
            'absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-sm transition-colors',
            item.isFavorite ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500',
          )}
          aria-label={item.isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <Star className="w-3.5 h-3.5" fill={item.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-1.5 flex-1">
        <div className="font-semibold text-[14px] leading-snug text-foreground line-clamp-2">
          {item.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{timeAgoShort(item.updatedAt)}</span>
          {projectLabel && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="truncate">{projectLabel}</span>
            </>
          )}
          {stats?.total_sends ? (
            <>
              <span className="text-muted-foreground/40 ml-auto">·</span>
              <span className="shrink-0">{stats.total_sends} sends</span>
            </>
          ) : null}
        </div>
        {item.subject && (
          <div className="text-[11.5px] text-muted-foreground/80 truncate mt-0.5">{item.subject}</div>
        )}
        {itemTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {itemTags.slice(0, 4).map((t) => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground truncate">
                #{t.label}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto pt-3 border-t border-border/60 flex items-center gap-1.5">
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-[12px]"
              onClick={(e) => { stop(e); onEdit(); }}
            >
              Edit
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-[12px] gap-1.5"
              asChild
              onClick={stop}
            >
              <a href="https://presaleproperties.com/agent/marketing" target="_blank" rel="noopener noreferrer">
                Edit on Presale <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={(e) => { stop(e); onSend(); }}
            aria-label="Send"
            title="Send"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={onDuplicate}
            aria-label="Duplicate"
            title="Duplicate to my library"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          {editable && (
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => { stop(e); onDelete(); }}
              aria-label="Delete"
              title="Archive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Preview pane
// ===========================================================================
function PreviewPane({
  item, onEdit, onDelete, onSend,
}: { item: UnifiedTemplate; onEdit: () => void; onDelete: () => void; onSend: () => void }) {
  const html = useMemo(() => renderWithSampleData(item.bodyHtml), [item.bodyHtml]);
  const { map: statsMap } = useTemplateStatsMap();
  const stats = statsMap.get(`${item.kind}:${item.id}`);
  const changeScope = useChangeTemplateScope();
  const editable = item.source !== 'presale' && !item.isLocked;

  return (
    <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="px-4 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-0.5">
              Preview
            </div>
            <div className="text-[14px] font-semibold truncate text-foreground">{item.name}</div>
            {item.subject && (
              <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                {renderWithSampleData(item.subject).replace(/<[^>]+>/g, '')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {editable && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={onSend}>
              <Send className="w-3.5 h-3.5" /> Send
            </Button>
            {editable && item.kind === 'email' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => changeScope.mutate({ id: item.id, scope: item.source === 'mine' ? 'team' : 'mine' })}
                  >
                    {item.source === 'mine' ? 'Share with team' : 'Move to my library'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="px-4 py-2 border-b border-border/60 bg-muted/20 flex items-center gap-4 text-[11.5px] text-muted-foreground shrink-0">
          <Stat label="Sends" value={stats.total_sends} />
          {item.kind === 'email' ? (
            <>
              <Stat label="Opened" value={stats.total_opens} />
              <Stat label="Clicked" value={stats.total_clicks} />
            </>
          ) : (
            <Stat label="Delivered" value={stats.total_opens} />
          )}
          {stats.last_sent_at && (
            <span className="ml-auto">Last sent {new Date(stats.last_sent_at).toLocaleDateString()}</span>
          )}
        </div>
      )}

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}

// ===========================================================================
// Editor / creator drawer
// ===========================================================================
function TemplateEditorDrawer({
  mode, template, kind, onClose,
}: {
  mode: 'create' | 'edit';
  template?: UnifiedTemplate;
  kind?: TemplateKind;
  onClose: () => void;
}) {
  const resolvedKind: TemplateKind = template?.kind ?? kind ?? 'email';
  const updateEmail = useUpdateEmailTemplate();
  const createEmail = useCreateEmailTemplate();
  const saveSms = useSaveSmsTemplate();
  const { data: folders = [] } = useTemplateFolders();
  const { data: tags = [] } = useTemplateTags();
  const addToFolder = useAddTemplateToFolder();
  const toggleTag = useToggleTagOnTemplate();

  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(
    resolvedKind === 'sms' ? (template?.bodyText ?? '') : (template?.bodyHtml ?? ''),
  );
  const [scope, setScope] = useState<'mine' | 'team'>(template?.source === 'mine' ? 'mine' : 'team');
  const [folderToAdd, setFolderToAdd] = useState<string | null>(null);
  const [tagIdsSel, setTagIdsSel] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      let savedId = template?.id ?? null;
      if (resolvedKind === 'email') {
        if (mode === 'edit' && template) {
          await updateEmail.mutateAsync({
            id: template.id,
            updates: { name, subject, html_content: body },
          });
        } else {
          await createEmail.mutateAsync({ name, subject, html_content: body, scope });
        }
      } else {
        const saved = await saveSms.mutateAsync({
          id: template?.id,
          name,
          body,
        } as any);
        savedId = (saved as any)?.id ?? template?.id ?? null;
      }
      // attach folder/tags for new ones (best-effort)
      if (mode === 'create' && savedId) {
        if (folderToAdd) {
          await addToFolder.mutateAsync({ folderId: folderToAdd, templateId: savedId, kind: resolvedKind });
        }
        for (const tid of tagIdsSel) {
          await toggleTag.mutateAsync({ tagId: tid, templateId: savedId, kind: resolvedKind, on: true });
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle>{mode === 'create' ? 'New' : 'Edit'} {resolvedKind === 'email' ? 'email' : 'SMS'} template</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot lead nudge" />
          </Field>
          {resolvedKind === 'email' && (
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
            </Field>
          )}
          <Field label={resolvedKind === 'email' ? 'Body (HTML)' : 'Message'}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={resolvedKind === 'email' ? 14 : 6}
              className="font-mono text-[12.5px]"
              placeholder={resolvedKind === 'email' ? '<p>Hi {{first_name}}, …</p>' : 'Hi {{first_name}}, …'}
            />
            <p className="text-[10.5px] text-muted-foreground mt-1">
              Use <code>{'{{first_name}}'}</code>, <code>{'{{agent_name}}'}</code>, and other merge tags. Preview shows them filled in.
            </p>
          </Field>

          {mode === 'create' && resolvedKind === 'email' && (
            <Field label="Visibility">
              <div className="flex gap-2">
                {(['mine', 'team'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={cn(
                      'flex-1 text-[12.5px] px-3 py-2 rounded border capitalize',
                      scope === s ? 'bg-primary/10 border-primary/40' : 'bg-muted/30 border-border',
                    )}
                  >
                    {s === 'mine' ? 'Just me' : 'Whole team'}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {mode === 'create' && (
            <>
              <Field label="Folder (optional)">
                <select
                  value={folderToAdd ?? ''}
                  onChange={(e) => setFolderToAdd(e.target.value || null)}
                  className="w-full h-9 rounded border border-border bg-background px-2 text-[13px]"
                >
                  <option value="">None</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags (optional)">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const on = tagIdsSel.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTagIdsSel(on ? tagIdsSel.filter((x) => x !== t.id) : [...tagIdsSel, t.id])}
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded border',
                          on ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/30 border-border text-muted-foreground',
                        )}
                      >
                        #{t.label}
                      </button>
                    );
                  })}
                  {tags.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">No tags yet — create them in the rail.</span>
                  )}
                </div>
              </Field>
            </>
          )}
        </div>
        <SheetFooter className="px-5 py-3 border-t flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ===========================================================================
// Archive button helper (handles both kinds)
// ===========================================================================
function ArchiveButton({ item, onDone }: { item: UnifiedTemplate | null; onDone: () => void }) {
  const archiveEmail = useSoftDeleteEmailTemplate();
  const deleteSms = useDeleteSmsTemplate();
  return (
    <AlertDialogAction
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      onClick={() => {
        if (!item) return;
        if (item.kind === 'email') archiveEmail.mutate(item.id);
        else deleteSms.mutate(item.id);
        onDone();
      }}
    >
      Archive
    </AlertDialogAction>
  );
}

// ===========================================================================
// SMS launcher (picks lead, then opens SendTextDialog)
// ===========================================================================
function SendTextLauncherDialog({ initialBody, onClose }: { initialBody: string; onClose: () => void }) {
  // Reuse the lead-aware dialog with an empty placeholder; the dialog itself
  // exposes a recipient row. To keep parity with NewEmailLauncherDialog, use
  // an empty contact and let SendTextDialog show the picker.
  const [picked, setPicked] = useState<CrmContact | null>(null);
  const fakeContact: CrmContact = picked ?? (EMPTY_CONTACT as CrmContact);
  return (
    <SendTextDialog
      contact={fakeContact}
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      initialBody={initialBody}
    />
  );
}

// ===========================================================================
// Empty state
// ===========================================================================
function EmptyState({ hasSearch, onCreate }: { hasSearch: boolean; onCreate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm py-12">
        <div className="w-12 h-12 mx-auto rounded-full bg-muted/60 flex items-center justify-center">
          <Mail className="w-5 h-5 opacity-50" />
        </div>
        <div className="text-[13.5px] text-muted-foreground">
          {hasSearch ? 'Nothing matches that search.' : 'No templates here yet.'}
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New template
        </Button>
      </div>
    </div>
  );
}
