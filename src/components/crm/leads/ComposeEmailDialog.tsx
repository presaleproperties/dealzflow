import { useState, useMemo, useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { useComposerBackButton } from '@/hooks/useComposerBackButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  FileText,
  Eye,
  Code2,
  Variable,
  Loader2,
  Monitor,
  Smartphone,
  ChevronDown,
  Save,
  Mail,
  User,
  Inbox,
  X,
  Search,
  Paperclip,
  Pencil,
  Check,
  MousePointerClick,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useEmailSignatures, useUpsertEmailSignature } from '@/hooks/useEmailSignatures';
import { useAddCrmMessage, useCrmContactMessages } from '@/hooks/useCrmLeadDetail';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useAuth } from '@/hooks/useAuth';
import { useBridgeSendEmail, useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates, useCreateTemplate } from '@/hooks/useCrmEmail';
import { TemplatePicker } from '@/components/crm/email/TemplatePicker';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { SignatureInlineFrame } from '@/components/crm/email/SignatureInlineFrame';
import { EMAIL_VARIABLES, EMAIL_VARIABLE_GROUPS, renderForRecipient } from '@/lib/emailVariables';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = 'edit' | 'html' | 'preview';
type AnyTpl = CrmEmailTemplate & { __isBridge?: boolean };

/* ---------- Sidebar template thumbnail (with safe fallback) ----------
 * We import the dedicated component module but guard against the off-chance
 * that the file is missing, fails to load, or doesn't export the expected
 * symbol. In any of those cases we render a lightweight placeholder so the
 * compose dialog never crashes the build or runtime. */
import { TemplateThumb as ImportedTemplateThumb } from '@/components/crm/email/TemplateThumb';

const FallbackThumb = ({ html: _html }: { html?: string | null }) => (
  <div className="w-full h-[88px] bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground">
    Preview unavailable
  </div>
);

const TemplateThumb: ComponentType<{ html?: string | null }> =
  (typeof ImportedTemplateThumb === 'function' ? ImportedTemplateThumb : FallbackThumb) as ComponentType<{
    html?: string | null;
  }>;

const RECENT_KEY = 'crm:compose:recent-template-ids';

const isRichSignatureHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|img|style|center|font)[\s>]/i.test(html)
  || /<[a-z][^>]*\sstyle\s*=/i.test(html);

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const addMessage = useAddCrmMessage();
  const sendBridge = useBridgeSendEmail();
  const createTemplate = useCreateTemplate();
  const { data: emailSettings } = useEmailSettings();
  const { data: signatures = [] } = useEmailSignatures();
  const upsertSignature = useUpsertEmailSignature();
  const { data: localTemplates = [] } = useCrmEmailTemplates();
  const { data: bridgeTemplates = [] } = useBridgeTemplates();
  const { data: messages = [] } = useCrmContactMessages(open ? contact.id : undefined);
  const { data: emailLog = [] } = useCrmEmailLog(open ? contact.id : undefined);

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [appendSignature, setAppendSignature] = useState(true);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [logOnly, setLogOnly] = useState(false);
  // Inline signature editor state
  const [editingSignature, setEditingSignature] = useState(false);
  const [sigDraft, setSigDraft] = useState('');
  // Mobile-only: collapse the inline signature preview by default so the
  // typing area dominates the screen. Tap "Show signature" to reveal.
  const [showSignaturePreviewMobile, setShowSignaturePreviewMobile] = useState(false);

  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('general');
  const [previewTpl, setPreviewTpl] = useState<AnyTpl | null>(null);
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varSearch, setVarSearch] = useState('');
  const autoSignaturePreviewedRef = useRef(false);

  /* Load recent template IDs from local storage when dialog opens */
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      setRecentIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecentIds([]);
    }
  }, [open]);

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      setSubject('');
      setBodyHtml('<p></p>');
      setCc('');
      setBcc('');
      setShowCcBcc(false);
      setMode('edit');
      setAppendSignature(true);
      setSelectedSignatureId(null);
      setEditingSignature(false);
      setSigDraft('');
      autoSignaturePreviewedRef.current = false;
    }
  }, [open]);

  /* Mobile back-button trap — keeps user on the lead detail page. */
  useComposerBackButton(open, onOpenChange);

  /* Pick default signature when dialog opens or signatures load */
  useEffect(() => {
    if (!open) return;
    if (selectedSignatureId) return;
    if (signatures.length === 0) return;
    const def = signatures.find((s) => s.is_default) ?? signatures[0];
    setSelectedSignatureId(def.id);
  }, [open, signatures, selectedSignatureId]);

  /* Resolve currently-selected signature HTML, falling back to legacy single signature */
  const activeSignatureHtml = useMemo(() => {
    if (selectedSignatureId) {
      const found = signatures.find((s) => s.id === selectedSignatureId);
      if (found) return found.html;
    }
    return emailSettings?.signature_html ?? '';
  }, [selectedSignatureId, signatures, emailSettings]);

  /* Note: signatures render in a live block beneath the editor (edit mode) and
     in the iframe preview (preview mode), so we no longer auto-switch modes. */

  const senderCtx = useMemo(
    () => ({
      lead: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
      },
      sender: {
        full_name: emailSettings?.sender_name ?? user?.email ?? '',
        first_name: (emailSettings?.sender_name ?? '').split(' ')[0] ?? '',
        email: emailSettings?.reply_to ?? user?.email ?? '',
        signature: activeSignatureHtml,
      },
    }),
    [contact, emailSettings, user, activeSignatureHtml],
  );

  const finalHtml = useMemo(() => {
    const merged = renderForRecipient(bodyHtml, senderCtx);
    if (appendSignature && activeSignatureHtml) {
      return `${merged}<br/><br/>${activeSignatureHtml}`;
    }
    return merged;
  }, [bodyHtml, senderCtx, appendSignature, activeSignatureHtml]);

  const renderedSubject = useMemo(
    () => renderForRecipient(subject, senderCtx),
    [subject, senderCtx],
  );

  /* Combined template list with bridge marker */
  const allTemplates: AnyTpl[] = useMemo(
    () => [
      ...bridgeTemplates.map((t) => ({ ...t, __isBridge: true } as AnyTpl)),
      ...localTemplates.map((t) => ({ ...t, __isBridge: false } as AnyTpl)),
    ],
    [bridgeTemplates, localTemplates],
  );

  /* Resolve recent templates (preserve order, fall back to most recently used) */
  const recentTemplates: AnyTpl[] = useMemo(() => {
    const byId = new Map(allTemplates.map((t) => [t.id, t]));
    const fromRecent = recentIds.map((id) => byId.get(id)).filter(Boolean) as AnyTpl[];
    if (fromRecent.length >= 4) return fromRecent.slice(0, 6);
    // Top up with first templates available
    const seen = new Set(fromRecent.map((t) => t.id));
    for (const t of allTemplates) {
      if (seen.has(t.id)) continue;
      fromRecent.push(t);
      if (fromRecent.length >= 6) break;
    }
    return fromRecent;
  }, [allTemplates, recentIds]);

  /**
   * Recent emails: merge real sent emails from `crm_email_log` (which carry
   * subject + open/click tracking) with conversation messages from
   * `crm_messages` (legacy/inbound). De-dupe on id and order by newest.
   */
  const recentEmails = useMemo(() => {
    const fromLog = (emailLog ?? []).map((e: any) => ({
      id: e.id,
      direction: e.direction,
      subject: e.subject,
      content: e.body ?? '',
      created_at: e.sent_at ?? e.created_at,
      open_count: e.open_count ?? 0,
      click_count: e.click_count ?? 0,
      last_opened_at: e.last_opened_at ?? null,
      last_clicked_at: e.last_clicked_at ?? null,
      __source: 'log' as const,
    }));
    const fromMessages = (messages ?? [])
      .filter((m: any) => m.channel === 'email')
      .map((m: any) => ({
        id: m.id,
        direction: m.direction,
        subject: m.subject ?? null,
        content: m.content ?? '',
        created_at: m.created_at,
        open_count: 0,
        click_count: 0,
        last_opened_at: null,
        last_clicked_at: null,
        __source: 'msg' as const,
      }));
    const merged = [...fromLog, ...fromMessages];
    merged.sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    );
    return merged.slice(0, 4);
  }, [emailLog, messages]);

  const applyTemplate = (tpl: AnyTpl) => {
    setSubject(tpl.subject || '');
    setBodyHtml(tpl.body_html || '<p></p>');
    /* Templates are full HTML emails (tables, inline styles, images) that the
       rich text editor cannot represent without flattening to plain text.
       Switch to Preview so the user sees the real design immediately, and
       leave HTML mode available for source-level tweaks. */
    setMode('preview');
    /* Templates ship with their own built-in signature, so disable the
       auto-appended default signature to prevent duplicates. */
    setAppendSignature(false);
    setEditingSignature(false);
    /* Track recent */
    const next = [tpl.id, ...recentIds.filter((id) => id !== tpl.id)].slice(0, 8);
    setRecentIds(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    toast.success(`Loaded "${tpl.name}"`);
  };

  const insertVariable = (token: string) => {
    setBodyHtml((prev) => {
      const insert = `{{${token}}}`;
      if (!prev || prev === '<p></p>') return `<p>${insert}</p>`;
      return prev.replace(/<\/p>\s*$/, `${insert}</p>`) || `${prev}${insert}`;
    });
  };

  /**
   * Insert a saved signature inline at the current location in the body.
   *
   * Edit (Tiptap) mode: append after the body since Tiptap can't host arbitrary HTML.
   * HTML mode: insert at the textarea cursor position so the user controls placement.
   * Preview mode: append at the end of the body HTML.
   *
   * Also disables the auto-append toggle so the signature isn't duplicated.
   */
  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const insertSignature = (sigHtml: string, sigName: string) => {
    if (!sigHtml) {
      toast.error('That signature is empty');
      return;
    }
    const block = `<br/><br/>${sigHtml}`;
    // Tiptap StarterKit would flatten rich signature markup, so route it to Preview.
    const isRich = isRichSignatureHtml(sigHtml);

    if (mode === 'html' && htmlTextareaRef.current) {
      const ta = htmlTextareaRef.current;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = ta.value.slice(0, start) + block + ta.value.slice(end);
      setBodyHtml(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + block.length;
        ta.setSelectionRange(pos, pos);
      });
    } else if (mode === 'edit' && isRich) {
      // Append, then switch to Preview so the rich signature renders intact
      // instead of being stripped to plain text by the rich text editor.
      setBodyHtml((prev) => `${prev || ''}${block}`);
      setMode('preview');
      toast.success(`Inserted "${sigName}" — switched to Preview to keep formatting`);
      setAppendSignature(false);
      return;
    } else {
      setBodyHtml((prev) => `${prev || ''}${block}`);
    }
    setAppendSignature(false);
    toast.success(`Inserted "${sigName}"`);
  };

  const bodyText = bodyHtml.replace(/<[^>]*>/g, '').trim();
  const canSend = !!contact.email && subject.trim() && bodyText;

  const openSaveDialog = () => {
    if (!bodyText) {
      toast.error('Write some content before saving as template');
      return;
    }
    setTplName(subject.trim() || 'Untitled template');
    setSaveOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!tplName.trim()) {
      toast.error('Template name is required');
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name: tplName.trim(),
        subject: subject.trim() || tplName.trim(),
        body_html: bodyHtml,
        category: tplCategory,
      });
      setSaveOpen(false);
      setTplName('');
    } catch {
      /* toast handled in hook */
    }
  };

  const handleSend = async () => {
    if (!canSend) {
      toast.error('Subject, body and a recipient email are required');
      return;
    }

    if (logOnly) {
      await addMessage.mutateAsync({
        contact_id: contact.id,
        direction: 'outbound',
        content: `Subject: ${renderedSubject}\n\n${finalHtml.replace(/<[^>]*>/g, ' ').trim()}`,
        channel: 'email',
        sent_by: 'Agent',
        message_type: 'text',
      });
      toast.success('Email logged');
      onOpenChange(false);
      return;
    }

    try {
      await sendBridge.mutateAsync({
        to: contact.email!,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: renderedSubject,
        html: finalHtml,
        contact_id: contact.id,
      });
      await addMessage.mutateAsync({
        contact_id: contact.id,
        direction: 'outbound',
        content: `Subject: ${renderedSubject}\n\n${finalHtml.replace(/<[^>]*>/g, ' ').trim()}`,
        channel: 'email',
        sent_by: 'Agent',
        message_type: 'text',
      });
      onOpenChange(false);
    } catch {
      /* toast handled in hook */
    }
  };

  const isPending = sendBridge.isPending || addMessage.isPending;

  /* Keyboard shortcut: ⌘+Enter / Ctrl+Enter sends from anywhere in the dialog */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSend && !isPending) handleSend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSend, isPending, finalHtml, renderedSubject, logOnly, cc, bcc]);

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${finalHtml}</body></html>`;

  /** Upload one or more files to storage and embed them inline in the email body.
   *  Images are inserted as <img>; other files become a link to the public URL. */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user?.id) {
      toast.error('You must be signed in to attach files');
      return;
    }
    setUploading(true);
    try {
      const inserts: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`"${file.name}" is larger than 20MB`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const { error } = await supabase.storage
          .from('email-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`Upload failed: ${file.name}`);
          continue;
        }
        const { data: pub } = supabase.storage.from('email-attachments').getPublicUrl(path);
        const url = pub.publicUrl;
        if (file.type.startsWith('image/')) {
          inserts.push(`<p><img src="${url}" alt="${safeName}" style="max-width:100%;height:auto;border-radius:6px;" /></p>`);
        } else {
          const sizeKb = Math.max(1, Math.round(file.size / 1024));
          inserts.push(
            `<p><a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:8px 12px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#0a0a0a;background:#f8f8f8;">📎 ${safeName} <span style="color:#888;font-size:12px;">(${sizeKb} KB)</span></a></p>`,
          );
        }
      }
      if (inserts.length) {
        setBodyHtml((prev) => `${prev || ''}${inserts.join('')}`);
        toast.success(`Attached ${inserts.length} file${inserts.length > 1 ? 's' : ''}`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* Compact Templates + Insert variable controls rendered in the editor toolbar.
   * Hidden on mobile — the mobile sticky action bar at the bottom is the
   * single source of truth for these actions to avoid duplication. */
  const composerActions = (
    <div className="hidden md:flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleAttachFiles(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Attach files or images"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        Attach
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={() => setPickerOpen(true)}
      >
        <FileText className="h-3.5 w-3.5" />
        Templates
      </Button>
      <Popover open={varPickerOpen} onOpenChange={(o) => { setVarPickerOpen(o); if (!o) setVarSearch(''); }}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs">
            <Variable className="h-3.5 w-3.5" />
            Insert variable
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[420px] p-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border bg-muted/30">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Merge variables
            </p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={varSearch}
                onChange={(e) => setVarSearch(e.target.value)}
                placeholder="Search by name, token, or example…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            {EMAIL_VARIABLE_GROUPS.map((group) => {
              const q = varSearch.trim().toLowerCase();
              const items = EMAIL_VARIABLES.filter((v) => v.group === group).filter((v) =>
                !q ||
                v.label.toLowerCase().includes(q) ||
                v.token.toLowerCase().includes(q) ||
                v.example.toLowerCase().includes(q),
              );
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div className="sticky top-0 z-10 px-3 py-1.5 bg-card/95 backdrop-blur border-b border-border/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                      <span className="ml-1.5 text-muted-foreground/60 normal-case tracking-normal">
                        · {items.length}
                      </span>
                    </span>
                  </div>
                  <div className="py-0.5">
                    {items.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => {
                          insertVariable(v.token);
                          toast.success(`Inserted {{${v.token}}}`);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent/60 focus:bg-accent/60 focus:outline-none transition-colors group"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate">
                            {v.label}
                          </span>
                          <code className="text-[10px] text-muted-foreground/80 shrink-0 group-hover:text-primary transition-colors">
                            {`{{${v.token}}}`}
                          </code>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                            Preview
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate italic">
                            {v.example}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {EMAIL_VARIABLES.filter((v) => {
              const q = varSearch.trim().toLowerCase();
              return !q ||
                v.label.toLowerCase().includes(q) ||
                v.token.toLowerCase().includes(q) ||
                v.example.toLowerCase().includes(q);
            }).length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No variables match "{varSearch}"
              </div>
            )}
          </div>
          <div className="px-3 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
            Click to insert into the email body. Examples shown are previews — recipients see real values.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent
          hideMobileHandle
          className="max-w-7xl w-screen sm:w-[98vw] sm:h-[92vh] h-[100dvh] max-h-[100dvh] sm:max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-2xl border-0 sm:border sm:border-border/60 shadow-2xl [&>button]:hidden"
        >
          {/* (Drag handle hidden on mobile — composer is full-screen, Cancel is the exit.) */}
          {/* Mobile header — Mail-app style: just Cancel + title. Send moved to bottom action bar. */}
          <DialogHeader className="md:hidden px-2 py-2 border-b border-border bg-background shrink-0 space-y-0 flex-row items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-[15px] font-semibold text-primary hover:opacity-80 active:opacity-60 px-3 py-2 -ml-1 rounded-md min-h-[40px] min-w-[64px] text-left"
              disabled={isPending}
              aria-label="Close composer"
            >
              Cancel
            </button>
            <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground truncate">
              New Message
            </DialogTitle>
            {/* Spacer to keep title centered (matches Cancel min-width) */}
            <span className="w-[64px] shrink-0" aria-hidden />
          </DialogHeader>

          {/* Mobile sub-header: just recipient identity (Templates moved to single bottom bar to remove duplication) */}
          <div className="md:hidden px-3 py-2 border-b border-border/60 bg-background/60 shrink-0 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[11px] font-semibold shrink-0">
              {(contact.first_name?.[0] ?? contact.email?.[0] ?? '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">
                {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unknown'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight">{contact.email ?? 'No email on file'}</p>
            </div>
          </div>

          {/* Desktop slim title bar */}
          <DialogHeader className="hidden md:block px-5 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur-sm shrink-0 space-y-0">
            <DialogTitle className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/90">
              New Message
            </DialogTitle>
          </DialogHeader>

          {/* Multi-column body */}
          <div className={cn(
            'flex-1 grid grid-cols-1 overflow-hidden min-h-0',
            previewTpl ? 'md:grid-cols-[260px_1fr_360px]' : 'md:grid-cols-[260px_1fr]',
          )}>
            {/* Sidebar */}
            <aside className="border-r border-border bg-muted/10 overflow-y-auto hidden md:block">
              {/* Lead identity */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                    {(contact.first_name?.[0] ?? contact.email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {[contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
                        contact.email ||
                        'Unknown'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{contact.email ?? 'No email'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {contact.status && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {contact.status}
                    </Badge>
                  )}
                  {contact.source && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {contact.source}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Recent templates */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent Templates
                  </h4>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    All
                  </button>
                </div>
                {recentTemplates.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-2">No templates yet</p>
                ) : (
                  <div className="space-y-2">
                    {recentTemplates.map((tpl) => (
                      <button
                        key={(tpl.__isBridge ? 'b:' : 'l:') + tpl.id}
                        onClick={() => setPreviewTpl(tpl)}
                        className={cn(
                          'w-full text-left bg-card border rounded-lg overflow-hidden hover:shadow-sm transition-all relative group',
                          previewTpl?.id === tpl.id ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/50',
                        )}
                      >
                        {tpl.__isBridge && (
                          <Badge className="absolute top-1 right-1 z-10 bg-primary/90 text-primary-foreground text-[8px] px-1 py-0 h-3.5">
                            PRESALE
                          </Badge>
                        )}
                        <div className="border-b border-border/40 overflow-hidden">
                          <TemplateThumb html={tpl.body_html ?? ''} />
                        </div>
                        <div className="p-2">
                          <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                            {tpl.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {tpl.subject}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent emails */}
              <div className="p-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Recent Conversation
                </h4>
                {recentEmails.length === 0 ? (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
                    <Inbox className="h-3.5 w-3.5" />
                    No prior emails
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentEmails.map((m: any) => (
                      <div
                        key={`${m.__source}:${m.id}`}
                        className="text-[11px] bg-card border border-border rounded-md p-2"
                      >
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {m.direction === 'outbound' ? (
                            <Send className="h-2.5 w-2.5 text-primary" />
                          ) : (
                            <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {m.created_at
                              ? new Date(m.created_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : ''}
                          </span>
                          {m.direction === 'outbound' && m.open_count > 0 && (
                            <span
                              className="ml-auto inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600"
                              title={
                                m.last_opened_at
                                  ? `Last opened ${new Date(m.last_opened_at).toLocaleString()}`
                                  : 'Opened'
                              }
                            >
                              <Eye className="h-2.5 w-2.5" />
                              {m.open_count}
                            </span>
                          )}
                          {m.direction === 'outbound' && m.click_count > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600"
                              title={
                                m.last_clicked_at
                                  ? `Last clicked ${new Date(m.last_clicked_at).toLocaleString()}`
                                  : 'Clicked'
                              }
                            >
                              <MousePointerClick className="h-2.5 w-2.5" />
                              {m.click_count}
                            </span>
                          )}
                        </div>
                        {m.subject && (
                          <p className="font-medium text-foreground truncate">{m.subject}</p>
                        )}
                        {m.content && (
                          <p className="line-clamp-2 text-foreground/70 mt-0.5">
                            {String(m.content).replace(/<[^>]+>/g, ' ').slice(0, 120)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            {/* Main composer column — single continuous surface, mail-app feel */}
            <div className="flex flex-col overflow-hidden min-h-0 bg-background">
              {/* Recipient rows — borderless, hairline-separated, like Apple Mail / Gmail */}
              <div className="px-3 sm:px-5 pt-2 pb-1 border-b border-border/60 shrink-0">
                <RecipientRow label="From">
                  <span className="text-[13px] text-foreground/80 truncate">
                    {emailSettings?.sender_name
                      ? `${emailSettings.sender_name} <${emailSettings.reply_to ?? user?.email ?? ''}>`
                      : (user?.email ?? '')}
                  </span>
                </RecipientRow>
                <RecipientRow
                  label="To"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowCcBcc((v) => !v)}
                      className="text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors"
                    >
                      {showCcBcc ? 'Hide' : 'Cc Bcc'}
                    </button>
                  }
                >
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[12.5px] text-foreground max-w-full">
                    <span className="h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] font-semibold inline-flex items-center justify-center shrink-0">
                      {(contact.first_name?.[0] ?? contact.email?.[0] ?? '?').toUpperCase()}
                    </span>
                    <span className="truncate">{contact.email ?? 'No email on file'}</span>
                  </span>
                </RecipientRow>
                {showCcBcc && (
                  <>
                    <RecipientRow label="Cc">
                      <input
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="cc@example.com"
                        className="w-full bg-transparent border-0 outline-none text-[13px] text-foreground placeholder:text-muted-foreground/50 px-0"
                      />
                    </RecipientRow>
                    <RecipientRow label="Bcc">
                      <input
                        value={bcc}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="bcc@example.com"
                        className="w-full bg-transparent border-0 outline-none text-[13px] text-foreground placeholder:text-muted-foreground/50 px-0"
                      />
                    </RecipientRow>
                  </>
                )}
                <RecipientRow label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    maxLength={200}
                    className="w-full bg-transparent border-0 outline-none text-[14px] font-semibold tracking-[-0.01em] text-foreground placeholder:font-normal placeholder:text-muted-foreground/50 px-0"
                  />
                </RecipientRow>
              </div>

              {/* Mode tabs — flush row, no heavy background block */}
              <div className="hidden md:flex px-4 py-1.5 border-b border-border/60 items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-0.5">
                  {(() => {
                    /* Detect "rich" template HTML the rich text editor can't represent. */
                    const isRichHtml = /<(table|td|tr|style|center|font|html|head|body|div[^>]*style=)/i.test(bodyHtml);
                    return ([
                      { v: 'edit', label: 'Editor', icon: FileText, disabled: isRichHtml, hint: isRichHtml ? 'Disabled: this template uses full HTML. Use Preview to see the design or HTML to edit the source.' : undefined },
                      { v: 'html', label: 'HTML', icon: Code2 },
                      { v: 'preview', label: 'Preview', icon: Eye },
                    ] as const).map((t) => (
                      <button
                        key={t.v}
                        onClick={() => !(t as any).disabled && setMode(t.v)}
                        disabled={(t as any).disabled}
                        title={(t as any).hint}
                        className={cn(
                          'h-7 px-2.5 text-[11.5px] rounded-md font-medium transition-colors flex items-center gap-1.5',
                          mode === t.v
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                          (t as any).disabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <t.icon className="h-3 w-3" />
                        {t.label}
                      </button>
                    ));
                  })()}
                </div>
                {mode === 'preview' && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={device === 'desktop' ? 'secondary' : 'ghost'}
                      className="h-7 w-7 p-0"
                      onClick={() => setDevice('desktop')}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={device === 'mobile' ? 'secondary' : 'ghost'}
                      className="h-7 w-7 p-0"
                      onClick={() => setDevice('mobile')}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Body area — flush, expansive, no inner padding boxes */}
              <div className="flex-1 overflow-hidden bg-background min-h-0 flex flex-col">
                {mode === 'edit' && (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <RichTextEditor
                      content={bodyHtml}
                      onChange={setBodyHtml}
                      placeholder="Write your message... use {{lead.first_name}} for personalization."
                      toolbarSlot={composerActions}
                      flushSignature
                      footerSlot={
                        appendSignature && activeSignatureHtml ? (
                          editingSignature ? (
                            <div className="border-t border-border/40">
                              <textarea
                                value={sigDraft}
                                onChange={(e) => setSigDraft(e.target.value)}
                                className="w-full font-mono text-[12px] leading-relaxed px-4 py-3 bg-transparent border-0 resize-y focus-visible:outline-none focus-visible:ring-0 text-foreground"
                                style={{ minHeight: 160 }}
                                spellCheck={false}
                                placeholder="Edit signature HTML…"
                              />
                            </div>
                          ) : (
                            <>
                              {/* Desktop: always show inline signature preview */}
                              <div className="hidden md:block">
                                <SignatureInlineFrame html={activeSignatureHtml} />
                              </div>
                              {/* Mobile: collapsed by default to maximize typing area */}
                              <div className="md:hidden border-t border-border/40">
                                {showSignaturePreviewMobile ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setShowSignaturePreviewMobile(false)}
                                      className="w-full text-left px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground active:opacity-60"
                                    >
                                      Hide signature
                                    </button>
                                    <SignatureInlineFrame html={activeSignatureHtml} />
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setShowSignaturePreviewMobile(true)}
                                    className="w-full text-left px-4 py-2.5 text-[12px] text-muted-foreground active:opacity-60 flex items-center justify-between"
                                  >
                                    <span>Signature attached</span>
                                    <span className="text-[11px] uppercase tracking-wider text-primary">Show</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )
                        ) : null
                      }
                    />
                  </div>
                )}
                {mode === 'html' && (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <textarea
                      ref={htmlTextareaRef}
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      className="w-full h-full font-mono text-xs p-5 bg-background border-0 resize-none focus-visible:outline-none"
                      spellCheck={false}
                    />
                  </div>
                )}
                {mode === 'preview' && (
                  <div
                    className={cn(
                      'flex-1 min-h-0 w-full flex justify-center overflow-hidden',
                      device === 'desktop' ? 'bg-background' : 'bg-muted/20 p-5',
                    )}
                  >
                    <iframe
                      title="email-preview"
                      srcDoc={previewDoc}
                      className={cn(
                        'bg-white transition-all block',
                        device === 'desktop'
                          ? 'w-full h-full border-0'
                          : 'w-[375px] h-full max-h-[640px] border border-border rounded-xl shadow-sm',
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Mobile sticky action bar — single source of truth for mobile actions */}
              <div className="md:hidden flex items-center gap-1 px-2 py-1.5 border-t border-border bg-card/95 backdrop-blur shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+2px)]">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="Templates"
                  className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted/60 text-foreground active:scale-95 transition-transform"
                  title="Templates"
                >
                  <FileText className="h-[15px] w-[15px]" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Attach"
                  className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted/60 text-foreground active:scale-95 transition-transform disabled:opacity-50"
                  title="Attach files"
                >
                  {uploading ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Paperclip className="h-[15px] w-[15px]" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'preview' ? 'edit' : 'preview'))}
                  aria-label={mode === 'preview' ? 'Edit' : 'Preview'}
                  className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted/60 text-foreground active:scale-95 transition-transform"
                  title={mode === 'preview' ? 'Back to editor' : 'Preview email'}
                >
                  <Eye className="h-[15px] w-[15px]" />
                </button>
                <select
                  value={appendSignature ? (selectedSignatureId ?? '') : '__none__'}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__none__') {
                      setAppendSignature(false);
                    } else {
                      setAppendSignature(true);
                      setSelectedSignatureId(v || null);
                    }
                  }}
                  className="min-w-0 flex-1 h-9 rounded-full border border-border bg-muted/60 px-2.5 text-[11.5px] font-medium text-foreground focus:outline-none truncate appearance-none"
                  aria-label="Signature"
                  title="Signature"
                >
                  <option value="__none__">No sig</option>
                  {signatures.map((s) => (
                    <option key={s.id} value={s.id}>
                      ✎ {s.name}{s.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                {/* Big primary Send button — bottom-right, thumb-reachable */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend || isPending}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold shadow-sm disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground transition-all active:scale-95"
                >
                  {isPending ? (
                    <Loader2 className="h-[15px] w-[15px] animate-spin" />
                  ) : (
                    <Send className="h-[15px] w-[15px]" />
                  )}
                  {isPending ? 'Sending' : 'Send'}
                </button>
              </div>

              {/* Footer — hidden on mobile (Send/Cancel live in the top bar) */}
              <div className="hidden md:flex px-5 py-3 border-t border-border bg-card items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {/* Single signature control: pick one (or none). Default is auto-selected on open. */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                      Signature
                    </span>
                    <select
                      value={appendSignature ? (selectedSignatureId ?? '') : '__none__'}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Switching signatures cancels any in-progress edit to avoid losing context.
                        if (editingSignature) {
                          setEditingSignature(false);
                          setSigDraft('');
                        }
                        if (v === '__none__') {
                          setAppendSignature(false);
                        } else {
                          setAppendSignature(true);
                          setSelectedSignatureId(v || null);
                        }
                      }}
                      disabled={editingSignature}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 max-w-[200px] disabled:opacity-60"
                      title={editingSignature ? 'Finish editing to switch signatures' : 'Choose a signature for this email'}
                    >
                      <option value="__none__">None</option>
                      {signatures.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    {appendSignature && selectedSignatureId && (() => {
                      const sig = signatures.find((s) => s.id === selectedSignatureId);
                      if (!sig) return null;
                      if (!editingSignature) {
                        return (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1 text-[11px]"
                            onClick={() => {
                              setSigDraft(sig.html ?? '');
                              setEditingSignature(true);
                            }}
                            title="Edit this signature inline"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        );
                      }
                      return (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 gap-1 text-[11px]"
                            disabled={upsertSignature.isPending || sigDraft === (sig.html ?? '')}
                            onClick={async () => {
                              try {
                                await upsertSignature.mutateAsync({
                                  id: sig.id,
                                  name: sig.name,
                                  html: sigDraft,
                                  is_default: sig.is_default,
                                  sort_order: sig.sort_order,
                                });
                                setEditingSignature(false);
                              } catch {
                                /* toast handled in hook */
                              }
                            }}
                            title="Save changes to this signature"
                          >
                            {upsertSignature.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1 text-[11px] text-muted-foreground"
                            onClick={() => {
                              setEditingSignature(false);
                              setSigDraft('');
                            }}
                            title="Discard changes"
                          >
                            <X className="h-3 w-3" />
                            Cancel
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logOnly}
                      onChange={(e) => setLogOnly(e.target.checked)}
                      className="rounded border-border"
                    />
                    Log only (don't send)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openSaveDialog}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save as template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSend}
                    disabled={!canSend || isPending}
                    title="Send (⌘ + Enter)"
                    className="gap-1.5 min-w-[110px]"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {isPending ? 'Sending...' : logOnly ? 'Log Email' : 'Send Email'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Right-side template preview pane */}
            {previewTpl && (
              <aside className="border-l border-border bg-muted/10 overflow-hidden hidden md:flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-border bg-card flex items-start justify-between gap-2 shrink-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Template Preview
                      </p>
                      {previewTpl.__isBridge && (
                        <Badge className="bg-primary/90 text-primary-foreground text-[8px] px-1 py-0 h-3.5">
                          PRESALE
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-foreground truncate">{previewTpl.name}</h4>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {previewTpl.subject || '(no subject)'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setPreviewTpl(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden p-3 min-h-0">
                  <iframe
                    title="template-preview"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${previewTpl.body_html ?? '<p style="color:#999">No content</p>'}</body></html>`}
                    className="w-full h-full bg-white border border-border rounded-lg"
                    sandbox="allow-same-origin"
                  />
                </div>
                <div className="px-4 py-3 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                  <Button type="button" size="sm" variant="outline" onClick={() => setPreviewTpl(null)}>
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      applyTemplate(previewTpl);
                      setPreviewTpl(null);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Apply Template
                  </Button>
                </div>
              </aside>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <TemplatePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={applyTemplate} />

      {/* Save as template sub-dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs">Template name</Label>
              <Input
                id="tpl-name"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Welcome email"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                value={subject}
                disabled
                className="h-9 bg-muted/40 text-xs"
                placeholder="(uses current subject)"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={tplCategory} onValueChange={setTplCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="welcome">Welcome</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="nurture">Nurture</SelectItem>
                  <SelectItem value="project-launch">Project launch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)} disabled={createTemplate.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={createTemplate.isPending} className="gap-1.5">
              {createTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * RecipientRow — Apple Mail / Gmail style hairline-separated row.
 */
function RecipientRow({
  label,
  children,
  trailing,
}: {
  label: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5 border-b border-border/30 last:border-b-0">
      <span className="w-[44px] sm:w-[58px] shrink-0 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
