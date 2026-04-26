// ComposerSurface — Apple-Mail-style inline composer for the CRM Email
// Workspace. Mirrors the body of `ComposeEmailDialog` but works for 0 or N
// recipients and lives inline (no Dialog wrapper). For 1 recipient it sends
// directly via the bridge; for 2+ it routes through `crm-mass-send-email`.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Send, FileText, Eye, Code2, Variable, Loader2, Monitor, Smartphone,
  Save, X, Search, Paperclip, Pencil, Check, Users, AlertTriangle,
  ChevronDown, MailWarning, UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useEmailSignatures, useUpsertEmailSignature } from '@/hooks/useEmailSignatures';
import { useBridgeSendEmail, useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates, useCreateTemplate } from '@/hooks/useCrmEmail';
import { useAuth } from '@/hooks/useAuth';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import { useMassSendEmail } from '@/hooks/useMassSendEmail';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { SignatureInlineFrame } from '@/components/crm/email/SignatureInlineFrame';
import { MassSendConfirmDialog } from '@/components/crm/email/MassSendConfirmDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMAIL_VARIABLES, EMAIL_VARIABLE_GROUPS, renderForRecipient } from '@/lib/emailVariables';
import { formatContactName } from '@/lib/format';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

type Mode = 'edit' | 'html' | 'preview';
type AnyTpl = CrmEmailTemplate & { __isBridge?: boolean };

export interface ComposerSurfaceProps {
  /** Recipients selected via RecipientsRail (0 = nothing selected, 1 = single send, 2+ = mass). */
  recipients: CrmContact[];
  /** Add a single recipient (used by the inline quick-add popover). */
  onAddRecipient?: (contact: CrmContact) => void;
  /** Remove a single recipient (chip × click). */
  onRemoveRecipient?: (id: string) => void;
  /** Clear all recipients. */
  onClearRecipients?: () => void;
  /** Optional template applied via TemplatesRail; ComposerSurface controls its own state from there. */
  appliedTemplate?: AnyTpl | null;
  /** Notify parent the template was consumed (so it can clear its highlight). */
  onTemplateApplied?: () => void;
  /** Called after a successful send so parent can refresh logs etc. */
  onSent?: () => void;
}

const isRichSignatureHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|img|style|center|font)[\s>]/i.test(html)
  || /<[a-z][^>]*\sstyle\s*=/i.test(html);

export function ComposerSurface({
  recipients,
  onAddRecipient,
  onRemoveRecipient,
  onClearRecipients,
  appliedTemplate,
  onTemplateApplied,
  onSent,
}: ComposerSurfaceProps) {
  const { user } = useAuth();
  const sendBridge = useBridgeSendEmail();
  const massSend = useMassSendEmail();
  const addMessage = useAddCrmMessage();
  const createTemplate = useCreateTemplate();
  const { data: emailSettings } = useEmailSettings();
  const { data: signatures = [] } = useEmailSignatures();
  const upsertSignature = useUpsertEmailSignature();

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [appendSignature, setAppendSignature] = useState(true);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [editingSignature, setEditingSignature] = useState(false);
  const [sigDraft, setSigDraft] = useState('');
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varSearch, setVarSearch] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('general');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [appliedTplId, setAppliedTplId] = useState<string | null>(null);

  /* Pick default signature on mount / when signatures load */
  useEffect(() => {
    if (selectedSignatureId || signatures.length === 0) return;
    const def = signatures.find((s) => s.is_default) ?? signatures[0];
    setSelectedSignatureId(def.id);
  }, [signatures, selectedSignatureId]);

  /* When a template is applied from the rail */
  useEffect(() => {
    if (!appliedTemplate || appliedTemplate.id === appliedTplId) return;
    setSubject(appliedTemplate.subject || '');
    setBodyHtml(appliedTemplate.body_html || '<p></p>');
    setMode('preview');
    setAppendSignature(false);
    setEditingSignature(false);
    setAppliedTplId(appliedTemplate.id);
    toast.success(`Loaded "${appliedTemplate.name}"`);
    onTemplateApplied?.();
  }, [appliedTemplate, appliedTplId, onTemplateApplied]);

  const activeSignatureHtml = useMemo(() => {
    if (selectedSignatureId) {
      const found = signatures.find((s) => s.id === selectedSignatureId);
      if (found) return found.html;
    }
    return emailSettings?.signature_html ?? '';
  }, [selectedSignatureId, signatures, emailSettings]);

  /* Use first recipient for variable preview; mass-send personalizes per row server-side */
  const previewRecipient = recipients[0];
  const senderCtx = useMemo(
    () => ({
      lead: {
        first_name: previewRecipient?.first_name ?? '',
        last_name: previewRecipient?.last_name ?? '',
        email: previewRecipient?.email ?? '',
        phone: previewRecipient?.phone ?? '',
      },
      sender: {
        full_name: emailSettings?.sender_name ?? user?.email ?? '',
        first_name: (emailSettings?.sender_name ?? '').split(' ')[0] ?? '',
        email: emailSettings?.reply_to ?? user?.email ?? '',
        signature: activeSignatureHtml,
      },
    }),
    [previewRecipient, emailSettings, user, activeSignatureHtml],
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

  const insertVariable = (token: string) => {
    setBodyHtml((prev) => {
      const insert = `{{${token}}}`;
      if (!prev || prev === '<p></p>') return `<p>${insert}</p>`;
      return prev.replace(/<\/p>\s*$/, `${insert}</p>`) || `${prev}${insert}`;
    });
  };

  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const insertSignature = (sigHtml: string, sigName: string) => {
    if (!sigHtml) {
      toast.error('That signature is empty');
      return;
    }
    const block = `<br/><br/>${sigHtml}`;
    const isRich = isRichSignatureHtml(sigHtml);
    if (mode === 'html' && htmlTextareaRef.current) {
      const ta = htmlTextareaRef.current;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = ta.value.slice(0, start) + block + ta.value.slice(end);
      setBodyHtml(next);
    } else if (mode === 'edit' && isRich) {
      setBodyHtml((prev) => `${prev || ''}${block}`);
      setMode('preview');
      toast.success(`Inserted "${sigName}" — switched to Preview`);
      setAppendSignature(false);
      return;
    } else {
      setBodyHtml((prev) => `${prev || ''}${block}`);
    }
    setAppendSignature(false);
    toast.success(`Inserted "${sigName}"`);
  };

  /* Recipient stats */
  const reachable = useMemo(() => recipients.filter((r) => !!r.email), [recipients]);
  const unreachable = recipients.length - reachable.length;
  const recipientCount = reachable.length;

  const bodyText = bodyHtml.replace(/<[^>]*>/g, '').trim();
  const canSend = recipientCount > 0 && subject.trim() && bodyText;

  /* Attachments */
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
    } catch { /* hook handles toast */ }
  };

  const resetComposer = () => {
    setSubject('');
    setBodyHtml('<p></p>');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setMode('edit');
    setAppendSignature(true);
    setEditingSignature(false);
    setSigDraft('');
    setAppliedTplId(null);
  };

  const doSingleSend = () => {
    const c = reachable[0];
    if (!c?.email) return;
    // Snapshot args so we can clear the composer immediately for instant UX,
    // then fire the network call in the background. Toasts are surfaced by
    // the underlying hooks if anything actually fails.
    const args = {
      to: c.email,
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: renderedSubject,
      html: finalHtml,
      contact_id: c.id,
    };
    const logArgs = {
      contact_id: c.id,
      direction: 'outbound' as const,
      content: `Subject: ${renderedSubject}\n\n${finalHtml.replace(/<[^>]*>/g, ' ').trim()}`,
      channel: 'email' as const,
      sent_by: 'Agent',
      message_type: 'text' as const,
    };
    resetComposer();
    onClearRecipients?.();
    onSent?.();
    void (async () => {
      try {
        await sendBridge.mutateAsync(args);
        await addMessage.mutateAsync(logArgs);
      } catch { /* hook handles toast */ }
    })();
  };

  const doMassSend = async () => {
    try {
      await massSend.mutateAsync({
        recipient_ids: reachable.map((r) => r.id),
        subject,
        body_html: bodyHtml,
        append_signature: appendSignature,
        signature_id: selectedSignatureId,
        cc: cc.trim() || null,
        bcc: bcc.trim() || null,
      });
      resetComposer();
      onClearRecipients?.();
      onSent?.();
    } catch { /* hook handles toast */ }
  };

  const handleSendClick = () => {
    if (!canSend) {
      toast.error('Pick a recipient, write a subject, and add some content');
      return;
    }
    if (recipientCount === 1) {
      void doSingleSend();
    } else {
      // 2+ recipients → confirmation dialog (always, even small batches)
      setConfirmOpen(true);
    }
  };

  const isPending = sendBridge.isPending || addMessage.isPending || massSend.isPending;

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${finalHtml}</body></html>`;

  const sendLabel = recipientCount === 0
    ? 'Pick a recipient'
    : recipientCount === 1
      ? `Send to ${formatContactName(reachable[0].first_name, reachable[0].last_name)}`
      : `Send to ${recipientCount.toLocaleString()} recipients`;

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Recipient bar — width matches the body composer (max-w-[920px]) */}
      <div className="px-6 pt-5 pb-4 border-b border-border/50 bg-card shrink-0">
        <div className="max-w-[920px] mx-auto">
        <div className="flex items-baseline justify-between mb-3.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground leading-none">New Message</h2>
          <button
            type="button"
            className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground font-semibold transition-colors"
            onClick={() => setShowCcBcc((v) => !v)}
          >
            {showCcBcc ? 'Hide Cc/Bcc' : 'Add Cc/Bcc'}
          </button>
        </div>

        <div className="space-y-0 divide-y divide-border/40 rounded-lg border border-border/40 bg-background/40 px-3.5">
          {/* From */}
          <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-2.5">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">From</Label>
            <span className="text-[12.5px] text-foreground/90 truncate">
              {emailSettings?.sender_name
                ? <><span className="font-medium">{emailSettings.sender_name}</span> <span className="text-muted-foreground/80">&lt;{emailSettings.reply_to ?? user?.email ?? ''}&gt;</span></>
                : (user?.email ?? '')}
            </span>
          </div>

          {/* To */}
          <div className="grid grid-cols-[60px_1fr] items-start gap-3 py-2.5">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold pt-1.5">To</Label>
            <div className="min-h-[28px] flex flex-wrap gap-1.5 items-center">
              {recipients.length === 0 ? (
                <span className="text-[12px] text-muted-foreground/60 mr-auto italic">
                  Search for a lead or pick from the right panel
                </span>
              ) : (
                <>
                  {recipients.slice(0, 6).map((r) => (
                    <span
                      key={r.id}
                      className={cn(
                        'inline-flex items-center gap-1.5 h-6 pl-2 pr-0.5 rounded-full text-[11.5px] font-medium border transition-colors',
                        r.email
                          ? 'bg-muted/60 border-border/60 text-foreground hover:bg-muted'
                          : 'bg-destructive/8 border-destructive/30 text-destructive',
                      )}
                      title={r.email ?? 'No email — will be skipped'}
                    >
                      {!r.email && <MailWarning className="h-3 w-3" />}
                      <span className="truncate max-w-[180px]">{formatContactName(r.first_name, r.last_name)}</span>
                      {onRemoveRecipient && (
                        <button
                          type="button"
                          onClick={() => onRemoveRecipient(r.id)}
                          className="rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
                          aria-label={`Remove ${formatContactName(r.first_name, r.last_name)}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {recipients.length > 6 && (
                    <span className="text-[10.5px] text-muted-foreground px-1">
                      +{recipients.length - 6} more
                    </span>
                  )}
                </>
              )}
              {onAddRecipient && (
                <RecipientQuickAdd
                  selectedIds={new Set(recipients.map((r) => r.id))}
                  onAdd={onAddRecipient}
                />
              )}
              {onClearRecipients && recipients.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRecipients}
                  className="ml-auto text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground px-1 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {showCcBcc && (
            <>
              <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-2.5">
                <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="h-8 text-[12.5px] border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent" />
              </div>
              <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-2.5">
                <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="h-8 text-[12.5px] border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent" />
              </div>
            </>
          )}

          {/* Subject */}
          <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-2.5">
            <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject — supports {{lead.first_name}}"
              className="h-8 text-[14px] font-semibold border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent placeholder:font-normal placeholder:text-muted-foreground/55 placeholder:italic tracking-[-0.01em]"
              maxLength={200}
            />
          </div>
        </div>

        {unreachable > 0 && (
          <div className="mt-2.5 ml-1 flex items-center gap-1.5 text-[11px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {unreachable} selected lead{unreachable === 1 ? '' : 's'} ha{unreachable === 1 ? 's' : 've'} no email and will be skipped
          </div>
        )}
        </div>
      </div>

      {/* Mode tabs — aligned to body width */}
      <div className="px-6 py-2 border-b border-border/40 bg-card shrink-0">
        <div className="max-w-[920px] mx-auto flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50">
          {(() => {
            const isRichHtml = /<(table|td|tr|style|center|font|html|head|body|div[^>]*style=)/i.test(bodyHtml);
            return ([
              { v: 'edit', label: 'Editor', icon: FileText, disabled: isRichHtml },
              { v: 'html', label: 'HTML', icon: Code2 },
              { v: 'preview', label: 'Preview', icon: Eye },
            ] as const).map((t) => (
              <button
                key={t.v}
                onClick={() => !(t as any).disabled && setMode(t.v)}
                disabled={(t as any).disabled}
                className={cn(
                  'h-7 px-3 text-[11.5px] rounded-md font-semibold transition-all flex items-center gap-1.5',
                  mode === t.v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
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
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors', device === 'desktop' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors', device === 'mobile' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Body — flex column so the editor stretches edge-to-edge with the header */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        {mode === 'edit' && (
          <div className="flex-1 min-h-0 flex flex-col px-6 max-w-[920px] mx-auto w-full">
            <RichTextEditor
              content={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message... use {{lead.first_name}} for personalization."
              toolbarSlot={
                <>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleAttachFiles(e.target.files)} />
                  <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    Attach
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
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Merge variables</p>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input autoFocus value={varSearch} onChange={(e) => setVarSearch(e.target.value)} placeholder="Search…" className="h-8 pl-7 text-xs" />
                        </div>
                      </div>
                      <div className="max-h-[440px] overflow-y-auto">
                        {EMAIL_VARIABLE_GROUPS.map((group) => {
                          const q = varSearch.trim().toLowerCase();
                          const items = EMAIL_VARIABLES.filter((v) => v.group === group).filter((v) =>
                            !q || v.label.toLowerCase().includes(q) || v.token.toLowerCase().includes(q) || v.example.toLowerCase().includes(q),
                          );
                          if (!items.length) return null;
                          return (
                            <div key={group}>
                              <div className="sticky top-0 z-10 px-3 py-1.5 bg-card/95 backdrop-blur border-b border-border/60">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                              </div>
                              <div className="py-0.5">
                                {items.map((v) => (
                                  <button key={v.token} type="button" onClick={() => { insertVariable(v.token); toast.success(`Inserted {{${v.token}}}`); }} className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-xs font-medium text-foreground truncate">{v.label}</span>
                                      <code className="text-[10px] text-muted-foreground/80 shrink-0">{`{{${v.token}}}`}</code>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground truncate italic">{v.example}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              }
              flushSignature
              footerSlot={appendSignature && activeSignatureHtml ? (
                editingSignature ? (
                  <div className="border-t border-border/60 bg-muted/5">
                    <textarea value={sigDraft} onChange={(e) => setSigDraft(e.target.value)} className="w-full font-mono text-[12px] leading-relaxed px-4 py-3 bg-transparent border-0 resize-y focus-visible:outline-none focus-visible:ring-0 text-foreground" style={{ minHeight: 160 }} spellCheck={false} />
                  </div>
                ) : (
                  <SignatureInlineFrame html={activeSignatureHtml} />
                )
              ) : null}
            />
          </div>
        )}
        {mode === 'html' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <div className="max-w-[920px] mx-auto">
              <textarea
                ref={htmlTextareaRef}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                className="w-full h-[400px] font-mono text-xs p-4 rounded-xl border border-border bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                spellCheck={false}
              />
            </div>
          </div>
        )}
        {mode === 'preview' && (
          <div className={cn('h-full w-full flex justify-center', device === 'desktop' ? 'bg-background' : 'bg-muted/20 p-5')}>
            <iframe
              title="email-preview"
              srcDoc={previewDoc}
              className={cn('bg-white transition-all block', device === 'desktop' ? 'w-full h-full border-0' : 'w-[375px] h-full max-h-[640px] border border-border rounded-xl shadow-sm')}
            />
          </div>
        )}
      </div>

      {/* Footer — premium sticky action bar */}
      <div className="px-6 py-3.5 border-t border-border/50 bg-gradient-to-b from-card to-card/80 backdrop-blur-md flex items-center justify-between gap-3 flex-wrap shrink-0 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold">Signature</span>
            <Select
              value={appendSignature ? (selectedSignatureId ?? '') : '__none__'}
              onValueChange={(v) => {
                if (editingSignature) { setEditingSignature(false); setSigDraft(''); }
                if (v === '__none__') setAppendSignature(false);
                else { setAppendSignature(true); setSelectedSignatureId(v || null); }
              }}
              disabled={editingSignature}
            >
              <SelectTrigger className="h-8 text-xs w-[180px] border-border/60 bg-background/60 hover:bg-background transition-colors">
                <SelectValue placeholder="Pick signature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {signatures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.is_default ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {appendSignature && selectedSignatureId && !editingSignature && (
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2 gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => {
                const sig = signatures.find((s) => s.id === selectedSignatureId);
                if (!sig) return;
                setSigDraft(sig.html ?? '');
                setEditingSignature(true);
              }}>
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            {editingSignature && (
              <>
                <Button type="button" size="sm" className="h-8 px-2.5 gap-1 text-[11px]" disabled={upsertSignature.isPending} onClick={async () => {
                  const sig = signatures.find((s) => s.id === selectedSignatureId);
                  if (!sig) return;
                  try {
                    await upsertSignature.mutateAsync({ id: sig.id, name: sig.name, html: sigDraft, is_default: sig.is_default, sort_order: sig.sort_order });
                    setEditingSignature(false);
                  } catch {}
                }}>
                  {upsertSignature.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 gap-1 text-[11px] text-muted-foreground" onClick={() => { setEditingSignature(false); setSigDraft(''); }}>
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openSaveDialog}
            disabled={isPending}
            className="h-9 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Save className="h-3.5 w-3.5" />
            Save as template
          </Button>
          <div className="h-6 w-px bg-border/60 mx-1" />
          <Button
            type="button"
            size="sm"
            onClick={handleSendClick}
            disabled={!canSend || isPending}
            className={cn(
              'h-9 gap-2 min-w-[160px] px-4 font-semibold text-[12.5px] tracking-[-0.005em] rounded-lg',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.5)] hover:shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.55)]',
              'transition-all disabled:shadow-none disabled:opacity-50',
            )}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : recipientCount > 1 ? <Users className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {isPending ? 'Sending…' : sendLabel}
          </Button>
        </div>
      </div>

      {/* Mass-send confirmation */}
      <MassSendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        recipients={reachable}
        excluded={recipients.filter((r) => !r.email)}
        subject={renderedSubject}
        previewHtml={finalHtml}
        isPending={isPending}
        onConfirm={async () => {
          setConfirmOpen(false);
          await doMassSend();
        }}
      />

      {/* Save as template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs">Name</Label>
              <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Welcome buyers email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-cat" className="text-xs">Category</Label>
              <Input id="tpl-cat" value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} placeholder="general" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={createTemplate.isPending}>
              {createTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Inline recipient quick-add — opens a popover with a fast search of all
 * leads. One click adds them to the To row. Always available, even when the
 * right Recipients panel is collapsed.
 */
function RecipientQuickAdd({
  selectedIds,
  onAdd,
}: {
  selectedIds: Set<string>;
  onAdd: (c: CrmContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: contacts = [] } = useCrmContacts();

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return contacts
        .filter((c) => !!c.email)
        .slice(0, 12);
    }
    return contacts
      .filter((c) => {
        const name = formatContactName(c.first_name, c.last_name).toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        const phone = (c.phone ?? '').toLowerCase();
        return name.includes(needle) || email.includes(needle) || phone.includes(needle);
      })
      .slice(0, 30);
  }, [contacts, q]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold text-foreground bg-muted/50 border border-border hover:bg-muted hover:border-foreground/30 transition-colors"
          aria-label="Add a recipient"
        >
          <UserPlus className="h-3 w-3" />
          Add
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email or phone…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {matches.length === 0 ? (
            <div className="text-[11.5px] text-muted-foreground text-center py-6 px-3">
              No leads match "{q}"
            </div>
          ) : (
            matches.map((c) => {
              const already = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={already}
                  onClick={() => {
                    onAdd(c);
                    setOpen(false);
                    setQ('');
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border/40 hover:bg-accent/60 transition-colors flex items-center justify-between gap-2',
                    already && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">
                      {formatContactName(c.first_name, c.last_name)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.email ?? <span className="text-amber-600">No email</span>}
                    </p>
                  </div>
                  {already ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
