import { useState, useMemo, useEffect, useRef } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  X, ChevronDown, Variable, FileText, Hash, Building2, User2,
  Send, Loader2, Calendar, AlertTriangle, Plus, Trash2, ShieldAlert, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  useSendSms, useBulkSendSms, useSmsTemplates, useSmsNumbers, useIsPhoneOptedOut,
  SMS_VARIABLES, renderSmsTemplate, smsSegments, type MessagingChannel,
} from '@/hooks/useSms';
import { useCrmProjects, type CrmProject } from '@/hooks/useCrmProjects';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AttachMenu } from '@/components/crm/shared/AttachMenu';
import { useDragAndPasteFiles } from '@/hooks/useDragAndPasteFiles';
import type { CrmContact } from '@/hooks/useCrmContacts';

/**
 * Build the canonical share URL for a project. Prefers explicit
 * `marketing_url` / `website_url` fields, then falls back to the
 * Presale Properties slug pattern. Returns `null` when nothing is known.
 */
function projectShareUrl(p: CrmProject): string | null {
  if (p.marketing_url?.startsWith('http')) return p.marketing_url;
  if (p.website_url?.startsWith('http')) return p.website_url;
  const slug = p.presale_slug || p.slug;
  if (slug) return `https://presaleproperties.com/${slug}`;
  return null;
}

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a channel (e.g. 'whatsapp' from the WhatsApp action button). */
  initialChannel?: MessagingChannel;
  /** Additional recipients for mass-send. When the total count is >1, the
   *  composer routes through `bulk-send-sms` (personalized server-side). The
   *  primary `contact` drives the live variable preview. */
  extraContacts?: CrmContact[];
  /** Fired after a successful send (single or mass). */
  onSent?: () => void;
}

function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function SendTextDialog({ contact, open, onOpenChange, initialChannel = 'sms', extraContacts, onSent }: Props) {
  const { user } = useAuth();
  const sendSms = useSendSms();
  const bulkSendSms = useBulkSendSms();
  const { data: templates = [] } = useSmsTemplates();
  const { data: numbers = [] } = useSmsNumbers();
  const { data: isOptedOut } = useIsPhoneOptedOut(contact.phone);
  const { data: projects = [] } = useCrmProjects();

  const [channel, setChannel] = useState<MessagingChannel>(initialChannel);
  const [body, setBody] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [fromOverride, setFromOverride] = useState<string>('');
  const [varOpen, setVarOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [pendingMediaUrl, setPendingMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset on close; sync channel with `initialChannel` on open
  useEffect(() => {
    if (open) {
      setChannel(initialChannel);
    } else {
      setBody('');
      setMediaUrls([]);
      setScheduled(false);
      setScheduledFor('');
      setFromOverride('');
    }
  }, [open, initialChannel]);

  // Resolve sender display
  const myNumber = useMemo(() => numbers.find(n => n.user_id === user?.id && n.is_active), [numbers, user]);
  const companyNumber = useMemo(() => numbers.find(n => n.is_company && n.is_active), [numbers]);
  const effectiveSender = fromOverride || myNumber?.phone || companyNumber?.phone || '';
  const senderLabel = fromOverride
    ? 'Custom'
    : myNumber?.phone
    ? (myNumber.label || 'You')
    : companyNumber?.phone
    ? 'Company'
    : 'No sender';

  // Personalized preview
  const ctx = useMemo(() => ({
    first_name: contact.first_name,
    last_name: contact.last_name,
    full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
    email: contact.email,
    phone: contact.phone,
    city: (contact as any).city,
    agent_name: user?.user_metadata?.full_name || user?.email,
    company: 'DealzFlow',
  }), [contact, user]);

  const preview = useMemo(() => renderSmsTemplate(body, ctx), [body, ctx]);
  const segs = useMemo(() => smsSegments(preview), [preview]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const list = q
      ? projects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.city ?? '').toLowerCase().includes(q) ||
          (p.developer ?? '').toLowerCase().includes(q),
        )
      : projects;
    return list.slice(0, 30);
  }, [projects, projectSearch]);

  function insertProjectUrl(p: CrmProject) {
    const url = projectShareUrl(p);
    if (!url) {
      toast.error(`No share URL on file for ${p.name}. Add a marketing URL or slug in Settings → Projects.`);
      return;
    }
    // Add a leading space when the body doesn't already end with whitespace,
    // so the URL doesn't glue onto the previous word.
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? body.length;
    const needsLeadingSpace = start > 0 && !/\s$/.test(body.slice(0, start));
    insertAtCursor(`${needsLeadingSpace ? ' ' : ''}${url} `);
    setProjectOpen(false);
    setProjectSearch('');
  }

  function insertAtCursor(text: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setBody(prev => prev + text);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Max file size is 5 MB');
      return;
    }
    try {
      setUploading(true);
      const ext = file.name.split('.').pop() || 'bin';
      const path = `sms/${user?.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('crm-sms-media').upload(path, file, { upsert: false });
      if (error) {
        // bucket may not exist yet — fall back to public 'public' bucket if available, else error
        toast.error('Storage bucket "crm-sms-media" not configured. Paste a public URL instead.');
        return;
      }
      const { data } = supabase.storage.from('crm-sms-media').getPublicUrl(path);
      setMediaUrls(prev => [...prev, data.publicUrl]);
      toast.success('Media attached');
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  /** Unified entry-point for AttachMenu / drag-drop / paste — uploads each
   *  file sequentially, hard cap of 10 attachments to stay under MMS limits. */
  async function handleFiles(files: File[]) {
    for (const f of files) {
      if (mediaUrls.length >= 10) {
        toast.error('Max 10 attachments per message');
        break;
      }
      await handleFileUpload(f);
    }
  }

  const { dragActive } = useDragAndPasteFiles({
    targetRef: composerRef,
    onFiles: (files) => { void handleFiles(files); },
    accept: ['image/', 'video/'],
    enabled: open,
  });

  function applyTemplate(tplId: string) {
    const t = templates.find(t => t.id === tplId);
    if (!t) return;
    setBody(t.body);
    if (t.default_media_urls?.length) setMediaUrls(t.default_media_urls);
    setTplOpen(false);
    // bump usage (best-effort)
    supabase.from('crm_sms_templates').update({
      times_used: (templates.find(t => t.id === tplId)?.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq('id', tplId).then(() => {}, () => {});
  }

  /** Combined recipient list — primary contact first then any extras passed
   *  in for mass-send. De-duplicated by id, must have a phone. */
  const allRecipients = useMemo(() => {
    const seen = new Set<string>();
    const out: CrmContact[] = [];
    for (const c of [contact, ...(extraContacts ?? [])]) {
      if (!c) continue;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [contact, extraContacts]);
  const reachable = useMemo(
    () => allRecipients.filter(c => !!c.phone && c.phone.replace(/\D/g, '').length >= 8),
    [allRecipients],
  );
  const skippedNoPhone = allRecipients.length - reachable.length;
  const isMass = reachable.length > 1;
  const isPending = sendSms.isPending || bulkSendSms.isPending;
  const canSend = isMass
    ? reachable.length > 0 && body.trim().length > 0 && !isPending
    : !!contact.phone && body.trim().length > 0 && !isPending && !isOptedOut;

  function handleSend() {
    if (scheduled && !scheduledFor) {
      toast.error('Pick a scheduled time');
      return;
    }
    if (isMass) {
      if (reachable.length === 0) {
        toast.error('No recipients with valid phone numbers');
        return;
      }
      bulkSendSms.mutate({
        name: `Blast — ${new Date().toLocaleDateString()}`,
        body,
        media_urls: mediaUrls,
        contact_ids: reachable.map(r => r.id),
        scheduled_for: scheduled ? new Date(scheduledFor).toISOString() : undefined,
        channel,
      }, {
        onSuccess: () => { onSent?.(); onOpenChange(false); },
      });
      return;
    }
    if (!contact.phone) {
      toast.error('This lead has no phone number');
      return;
    }
    sendSms.mutate({
      contact_id: contact.id,
      to: contact.phone,
      body: preview,
      from: fromOverride || undefined,
      media_urls: mediaUrls,
      channel,
      scheduled_for: scheduled ? new Date(scheduledFor).toISOString() : undefined,
    }, {
      onSuccess: () => { onSent?.(); onOpenChange(false); },
    });
  }

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim().toUpperCase() || 'LEAD';

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        ref={composerRef}
        hideMobileHandle
        className="sm:max-w-[920px] w-screen sm:w-[92vw] h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-2xl [&>button]:hidden"
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-[2px] border-2 border-dashed border-primary rounded-none sm:rounded-2xl">
            <div className="rounded-xl bg-background/95 px-5 py-3 shadow-lg border border-border text-sm font-semibold text-foreground">
              Drop to attach
            </div>
          </div>
        )}
        {/* Header — sticky, consistent vertical rhythm */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-8 h-12 sm:h-14 border-b shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="text-[15px] sm:text-base font-bold uppercase tracking-wider truncate">
              Send {channel === 'whatsapp' ? 'WhatsApp' : 'Text'}
            </h2>
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted shrink-0">
              <button
                onClick={() => setChannel('sms')}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded font-semibold uppercase tracking-wider transition-colors',
                  channel === 'sms' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                )}
              >SMS</button>
              <button
                onClick={() => setChannel('whatsapp')}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded font-semibold uppercase tracking-wider transition-colors flex items-center gap-1',
                  channel === 'whatsapp' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> WA
              </button>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mr-1 p-1"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body — keeps the footer pinned on both mobile + desktop */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* From row */}
          <div className="flex items-center gap-3 px-5 sm:px-8 h-11 sm:h-14 border-b">
            <span className="text-xs sm:text-sm font-mono text-foreground truncate">
              {formatPhoneDisplay(effectiveSender) || <span className="text-muted-foreground italic">Not configured</span>}
            </span>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider px-2 py-0 h-5 shrink-0">
              {senderLabel}
            </Badge>
            <div className="flex-1" />
            {numbers.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">Pick sender</div>
                  {numbers.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setFromOverride(n.phone)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-muted',
                        fromOverride === n.phone && 'bg-muted'
                      )}
                    >
                      <span className="font-mono">{formatPhoneDisplay(n.phone)}</span>
                      {n.is_company && <Badge variant="secondary" className="text-[10px]">Company</Badge>}
                      {n.user_id === user?.id && <Badge className="text-[10px]">You</Badge>}
                    </button>
                  ))}
                  {fromOverride && (
                    <button onClick={() => setFromOverride('')} className="w-full text-left text-xs text-muted-foreground px-2 py-1.5 hover:bg-muted rounded mt-1">
                      Reset to default
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* To row */}
          <div className="flex items-center gap-3 px-5 sm:px-8 h-11 sm:h-14 border-b">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border min-w-0">
              <span className="text-xs sm:text-sm font-medium tracking-wide truncate">{fullName}</span>
              {contact.phone && <span className="text-[11px] sm:text-xs text-muted-foreground font-mono shrink-0">{formatPhoneDisplay(contact.phone)}</span>}
            </div>
          </div>

          {/* Opt-out / no phone warning */}
          {!contact.phone && (
            <div className="flex items-start gap-2 px-5 sm:px-8 py-2.5 bg-destructive/10 border-b border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">No phone number on file for this lead. Add one to send a text.</p>
            </div>
          )}
          {isOptedOut && (
            <div className="flex items-start gap-2 px-5 sm:px-8 py-2.5 bg-destructive/10 border-b border-destructive/20">
              <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive font-medium">This contact has opted out (replied STOP). Sending is blocked.</p>
            </div>
          )}

          {/* Composer */}
          <div className="px-5 sm:px-8 py-4 sm:py-5 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3">
              <p className="text-xs text-muted-foreground min-w-0 truncate order-2 sm:order-1 basis-full sm:basis-auto">
                Will be delivered as <strong className="text-foreground">{segs.count} message{segs.count !== 1 ? 's' : ''}</strong>.
              </p>
              <div className="flex items-center gap-1 shrink-0 order-1 sm:order-2 ml-auto">
                {/* Templates */}
                <Popover open={tplOpen} onOpenChange={setTplOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Templates">
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="px-3 py-2 border-b">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Templates</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {templates.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No templates yet.<br />
                          Create one in SMS Center.
                        </div>
                      ) : templates.filter(t => t.is_active).map(t => (
                        <button
                          key={t.id}
                          onClick={() => applyTemplate(t.id)}
                          className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0"
                        >
                          <div className="text-sm font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.body}</div>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Project picker — inserts the project share URL at the cursor */}
                <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert project link">
                      <Building2 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="px-3 py-2 border-b">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Insert project link</p>
                    </div>
                    <div className="px-3 py-2 border-b">
                      <Input
                        autoFocus
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects, city, developer…"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {projects.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No projects yet.<br />
                          Add some in Settings → Projects.
                        </div>
                      ) : filteredProjects.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No matches for "{projectSearch}".
                        </div>
                      ) : filteredProjects.map(p => {
                        const url = projectShareUrl(p);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => insertProjectUrl(p)}
                            disabled={!url}
                            className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              {p.city && <span className="truncate">{p.city}</span>}
                              {url ? (
                                <span className="truncate font-mono text-[10px] ml-auto">{url.replace(/^https?:\/\//, '')}</span>
                              ) : (
                                <span className="ml-auto text-destructive/80">No URL on file</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Attachments — unified paperclip (iOS sheet on mobile, file picker on desktop).
                    Drag/drop + paste-image are wired on the dialog root via useDragAndPasteFiles. */}
                <div className="relative">
                  <AttachMenu
                    variant="icon"
                    multiple
                    accept="image/*,video/*"
                    uploading={uploading}
                    onFiles={(f) => handleFiles(f)}
                  />
                  {mediaUrls.length > 0 && (
                    <span className="pointer-events-none absolute top-0 right-0 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center text-primary-foreground">
                      {mediaUrls.length}
                    </span>
                  )}
                </div>
                {/* Secondary "manage" — only shown when at least 1 attachment exists, or to paste a URL */}
                <Popover open={mediaOpen} onOpenChange={setMediaOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px] text-muted-foreground" title="Manage attachments">
                      {mediaUrls.length > 0 ? `${mediaUrls.length} file${mediaUrls.length > 1 ? 's' : ''}` : 'URL'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3 space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Attachments (MMS)</p>
                    {mediaUrls.length > 0 && (
                      <div className="space-y-1">
                        {mediaUrls.map((u, i) => (
                          <div key={i} className="flex items-center gap-2 p-1.5 bg-muted rounded">
                            <span className="text-[11px] truncate flex-1 font-mono">{u.split('/').pop()}</span>
                            <button onClick={() => setMediaUrls(prev => prev.filter((_, idx) => idx !== i))}>
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Input
                        value={pendingMediaUrl}
                        onChange={(e) => setPendingMediaUrl(e.target.value)}
                        placeholder="Paste public image URL"
                        className="text-xs h-8"
                      />
                      <Button
                        size="sm" variant="outline"
                        onClick={() => {
                          const url = pendingMediaUrl.trim();
                          if (!/^https:\/\/\S+$/i.test(url)) {
                            toast.error('Must be a public https:// URL');
                            return;
                          }
                          if (mediaUrls.length >= 10) {
                            toast.error('Max 10 attachments');
                            return;
                          }
                          setMediaUrls(prev => [...prev, url]);
                          setPendingMediaUrl('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Up to 10 attachments · 5 MB max each · drag, paste, or tap the paperclip</p>
                  </PopoverContent>
                </Popover>

                {/* Variables */}
                <Popover open={varOpen} onOpenChange={setVarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert variable">
                      <Variable className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="px-3 py-2 border-b">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Insert variable</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {SMS_VARIABLES.map(v => (
                        <button
                          key={v.tag}
                          onClick={() => { insertAtCursor(v.tag); setVarOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-medium">{v.label}</div>
                            <code className="text-[10px] text-muted-foreground font-mono">{v.tag}</code>
                          </div>
                          <span className="text-[11px] text-muted-foreground italic truncate max-w-[100px]">{v.sample}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Write your message to ${contact.first_name || 'this lead'}…`}
                maxLength={1600}
                className="min-h-[260px] sm:min-h-[300px] resize-none text-[15px] leading-relaxed pb-10 border rounded-lg focus-visible:ring-1 focus-visible:ring-primary px-4 py-3"
              />
              <div className="absolute bottom-2 right-3 flex items-center gap-2 text-[11px] text-muted-foreground pointer-events-none">
                <span className="font-mono">{preview.length}/1600</span>
                <span className="text-muted-foreground/50">·</span>
                <span>{segs.count} SMS</span>
              </div>
            </div>

            {/* Live preview when variables present */}
            {body.includes('{{') && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Preview</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{preview}</p>
              </div>
            )}

            {/* Schedule */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Switch id="schedule" checked={scheduled} onCheckedChange={setScheduled} />
                <Label htmlFor="schedule" className="text-xs cursor-pointer flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Schedule
                </Label>
              </div>
              {scheduled && (
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="h-8 text-xs flex-1 min-w-[180px] sm:flex-none sm:w-52"
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer — pinned, safe-area aware on mobile */}
        <div className="flex items-center justify-end gap-2 px-5 sm:px-8 h-14 sm:h-16 border-t bg-muted/30 shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="min-w-[110px]"
          >
            {sendSms.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Sending</>
            ) : scheduled ? (
              <><Calendar className="h-4 w-4 mr-1.5" />Schedule</>
            ) : (
              <><Send className="h-4 w-4 mr-1.5" />Send</>
            )}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
