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
  Save, X, Search, Pencil, Check, Users, AlertTriangle,
  ChevronDown, MailWarning, UserPlus, Building2,
} from 'lucide-react';
import { useCrmProjects, type CrmProject } from '@/hooks/useCrmProjects';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { supabase } from '@/integrations/supabase/client';

import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useEmailSignatures, useUpsertEmailSignature } from '@/hooks/useEmailSignatures';
import { useBridgeSendEmail, useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates, useCreateTemplate } from '@/hooks/useCrmEmail';
import { useAuth } from '@/hooks/useAuth';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import { useEmailDraftAutosave, loadEmailDraft, clearEmailDraft } from '@/hooks/useEmailDraftAutosave';
import { useDragAndPasteFiles } from '@/hooks/useDragAndPasteFiles';
import { AttachMenu } from '@/components/crm/shared/AttachMenu';
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

/** Public-facing share URL for a project (mirrors SendTextDialog). */
function projectShareUrl(p: CrmProject): string | null {
  if (p.marketing_url?.startsWith('http')) return p.marketing_url;
  if (p.website_url?.startsWith('http')) return p.website_url;
  const slug = p.presale_slug || p.slug;
  if (slug) return `https://presaleproperties.com/${slug}`;
  return null;
}

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
  const { data: projects = [] } = useCrmProjects();

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
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  /* Draft autosave — workspace-wide single draft. Survives navigation / reload.
     Cross-tab sync: edits in another tab live-update this composer. */
  const draftScope = 'workspace';
  const { savedAt } = useEmailDraftAutosave(
    draftScope,
    { subject, bodyHtml, cc, bcc },
    true,
    (remote) => {
      setSubject(remote.subject || '');
      setBodyHtml(remote.bodyHtml || '<p></p>');
      setCc(remote.cc || '');
      setBcc(remote.bcc || '');
      if (remote.cc || remote.bcc) setShowCcBcc(true);
    },
  );
  const draftRestored = useRef(false);
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;
    const draft = loadEmailDraft(draftScope);
    if (!draft) return;
    setSubject(draft.subject || '');
    setBodyHtml(draft.bodyHtml || '<p></p>');
    setCc(draft.cc || '');
    setBcc(draft.bcc || '');
    if (draft.cc || draft.bcc) setShowCcBcc(true);
  }, []);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const list = q
      ? projects.filter((p) =>
          p.name.toLowerCase().includes(q)
          || (p.city ?? '').toLowerCase().includes(q)
          || (p.developer ?? '').toLowerCase().includes(q),
        )
      : projects;
    return list.slice(0, 40);
  }, [projects, projectSearch]);

  const insertProjectLink = (p: CrmProject) => {
    const url = projectShareUrl(p);
    if (!url) {
      toast.error(`No share URL for ${p.name}. Add one in Settings → Projects.`);
      return;
    }
    const safeName = p.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const anchor = `<p><a href="${url}" target="_blank" rel="noopener">${safeName}</a></p>`;
    setBodyHtml((prev) => (!prev || prev === '<p></p>' ? anchor : `${prev}${anchor}`));
    setProjectOpen(false);
    setProjectSearch('');
    toast.success(`Inserted link to ${p.name}`);
  };

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
      // Single <br/> seam — signature reads flush against the body, no
      // gratuitous spacing or `-- ` separator.
      return `${merged}<br/>${activeSignatureHtml}`;
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
  const isBodyEmpty = !bodyText;

  /* Quick-start openers — fill the empty composer with one tasteful click. */
  const QUICK_OPENERS: { label: string; html: string }[] = [
    {
      label: 'Warm intro',
      html: `<p>Hi {{lead.first_name}},</p><p>Hope you're having a great week. I wanted to follow up on the units we discussed — happy to share fresh availability whenever you're ready.</p><p>Best,<br/>{{sender.first_name}}</p>`,
    },
    {
      label: 'New listing',
      html: `<p>Hi {{lead.first_name}},</p><p>A new presale that fits what you're looking for just hit the market. Want me to send the floorplans and price list?</p><p>Talk soon,<br/>{{sender.first_name}}</p>`,
    },
    {
      label: 'Quick check-in',
      html: `<p>Hi {{lead.first_name}},</p><p>Quick check-in — still on the hunt, or has timing shifted? Either way, I'll keep an eye out for the right fit.</p><p>Cheers,<br/>{{sender.first_name}}</p>`,
    },
    {
      label: 'Book a call',
      html: `<p>Hi {{lead.first_name}},</p><p>Would a 15-minute call this week help map out next steps? I can send a couple of times that work on my end.</p><p>Best,<br/>{{sender.first_name}}</p>`,
    },
  ];

  /* Attachments */
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const handleAttachFiles = async (files: File[] | FileList | null) => {
    const list = !files ? [] : Array.isArray(files) ? files : Array.from(files);
    if (list.length === 0) return;
    if (!user?.id) {
      toast.error('You must be signed in to attach files');
      return;
    }
    setUploading(true);
    try {
      const inserts: string[] = [];
      for (const file of list) {
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
        // 30-day signed URL — bucket is locked to CRM members, so external recipients
        // need a signed URL to render embedded images / download attachments.
        const { data: signed, error: signErr } = await supabase.storage
          .from('email-attachments')
          .createSignedUrl(path, 60 * 60 * 24 * 30);
        if (signErr || !signed?.signedUrl) {
          toast.error(`Could not generate share link: ${file.name}`);
          continue;
        }
        const url = signed.signedUrl;
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
    }
  };
  const { dragActive } = useDragAndPasteFiles({
    targetRef: composerRef,
    onFiles: (files) => { void handleAttachFiles(files); },
  });

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
    clearEmailDraft(draftScope);
  };

  const doSingleSend = () => {
    const c = reachable[0];
    if (!c?.email) return;
    // Manual recipients (typed-in emails) carry a synthetic id like
    // `manual:foo@bar.com` — they have no CRM contact row, so we must NOT
    // pass contact_id to the bridge and we skip the activity log insert.
    const isManual = typeof c.id === 'string' && c.id.startsWith('manual:');
    const args = {
      to: c.email,
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: renderedSubject,
      html: finalHtml,
      contact_id: isManual ? null : c.id,
    };
    // NOTE: when contact_id is provided, the DB trigger
    // `trg_crm_sync_email_log_to_messages` automatically creates a properly-
    // linked chat message row (with source_table='crm_email_log' + source_id).
    // We MUST NOT insert a duplicate row here, otherwise the chat thread
    // renders an orphan with stripped text and no HTML body.
    resetComposer();
    onClearRecipients?.();
    onSent?.();
    void (async () => {
      try {
        await sendBridge.mutateAsync(args);
        triggerHaptic('success');
      } catch { /* hook handles toast */ }
    })();
  };

  const doMassSend = async () => {
    try {
      // Split CRM recipients (use mass-send for personalization) from
      // manual typed-email recipients (no CRM row → fan out via bridge).
      const crmRecipients = reachable.filter((r) => !(typeof r.id === 'string' && r.id.startsWith('manual:')));
      const manualRecipients = reachable.filter((r) => typeof r.id === 'string' && r.id.startsWith('manual:'));

      if (crmRecipients.length > 0) {
        await massSend.mutateAsync({
          recipient_ids: crmRecipients.map((r) => r.id),
          subject,
          body_html: bodyHtml,
          append_signature: appendSignature,
          signature_id: selectedSignatureId,
          cc: cc.trim() || null,
          bcc: bcc.trim() || null,
        });
      }
      for (const m of manualRecipients) {
        if (!m.email) continue;
        await sendBridge.mutateAsync({
          to: m.email,
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: renderedSubject,
          html: finalHtml,
          contact_id: null,
        });
      }
      resetComposer();
      onClearRecipients?.();
      onSent?.();
      triggerHaptic('success');
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
    <div ref={composerRef} className="relative flex flex-col h-full min-h-0 bg-muted/30">
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-[2px] border-2 border-dashed border-primary">
          <div className="rounded-xl bg-background/95 px-5 py-3 shadow-lg border border-border text-sm font-semibold text-foreground">
            Drop to attach
          </div>
        </div>
      )}
      {/* Recipient bar — width matches the body composer (max-w-[920px]) */}
      <div className="px-3 pt-3 pb-2 lg:px-6 lg:pt-5 lg:pb-4 border-b border-border/60 bg-card shrink-0">
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
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" autoComplete="email" className="h-8 text-[12.5px] border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent" />
              </div>
              <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-2.5">
                <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" autoComplete="email" className="h-8 text-[12.5px] border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent" />
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
      <div className="px-3 py-1.5 lg:px-6 lg:py-2 border-b border-border/40 bg-card shrink-0">
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

      {/* Body — flex column so the editor stretches edge-to-edge with the header.
          Mobile: zero padding so the editor + signature fill all available space
          with no white space gap below. Desktop: keep the airy framed look. */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-0 py-0 lg:px-6 lg:py-5 bg-card lg:bg-transparent">
        {mode === 'edit' && (
          <div className="flex-1 min-h-0 flex flex-col w-full max-w-[920px] mx-auto rounded-none lg:rounded-xl border-0 lg:border lg:border-border/70 bg-card shadow-none lg:shadow-sm overflow-hidden">
            <RichTextEditor
              content={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your message... use {{lead.first_name}} for personalization."
              toolbarSlot={
                <>
                  <AttachMenu
                    onFiles={(f) => handleAttachFiles(f)}
                    uploading={uploading}
                    className="h-8 px-2 text-xs"
                  />
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
                  <Popover open={projectOpen} onOpenChange={(o) => { setProjectOpen(o); if (!o) setProjectSearch(''); }}>
                    <PopoverTrigger asChild>
                      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" title="Insert project link">
                        <Building2 className="h-3.5 w-3.5" />
                        Project
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[380px] p-0 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-border bg-muted/30">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Insert project link</p>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input autoFocus value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search projects, city, developer…" className="h-8 pl-7 text-xs" />
                        </div>
                      </div>
                      <div className="max-h-[440px] overflow-y-auto py-1">
                        {projects.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            No projects yet.<br />Add some in Settings → Projects.
                          </div>
                        ) : filteredProjects.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                            No matches for "{projectSearch}".
                          </div>
                        ) : filteredProjects.map((p) => {
                          const url = projectShareUrl(p);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => insertProjectLink(p)}
                              className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-xs font-medium text-foreground truncate">{p.name}</span>
                                {!url && <span className="text-[10px] text-amber-600 shrink-0">no URL</span>}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {[p.city, p.developer].filter(Boolean).join(' · ') || (url ?? '—')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              }
              flushSignature
              footerSlot={
                <>
                  {isBodyEmpty && (
                    <div className="hidden lg:block px-4 pb-5 pt-1">
                      <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-muted/30 to-transparent px-4 py-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Quick start</p>
                            <p className="text-[12px] text-muted-foreground mt-0.5">Pick an opener — you can edit everything before sending.</p>
                          </div>
                          <span className="hidden sm:inline-flex text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 rounded-full bg-background/60 border border-border/40">
                            {recipientCount > 0 ? `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}` : 'No recipients yet'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {QUICK_OPENERS.map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              onClick={() => setBodyHtml(q.html)}
                              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-foreground bg-background/80 border border-border/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all shadow-sm"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-primary/60 group-hover:bg-primary transition-colors" />
                              {q.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2 text-[11px] text-muted-foreground/80">
                          <Variable className="h-3 w-3" />
                          <span>Tip: use <code className="px-1 py-0.5 rounded bg-muted/60 text-[10px] text-foreground/80">{'{{lead.first_name}}'}</code> anywhere to personalize.</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {appendSignature && activeSignatureHtml ? (
                    editingSignature ? (
                      <div className="border-t border-border/60 bg-muted/5">
                        <textarea value={sigDraft} onChange={(e) => setSigDraft(e.target.value)} className="w-full font-mono text-[12px] leading-relaxed px-4 py-3 bg-transparent border-0 resize-y focus-visible:outline-none focus-visible:ring-0 text-foreground" style={{ minHeight: 160 }} spellCheck={false} />
                      </div>
                    ) : (
                      // Mobile: render signature as an inline continuation of the body
                      // (no border seam, no extra padding) so it reads as one unified
                      // message — exactly like Apple Mail / Gmail mobile.
                      <div className="pt-1 lg:pt-0">
                        <SignatureInlineFrame html={activeSignatureHtml} />
                      </div>
                    )
                  ) : null}
                </>
              }
            />
          </div>
        )}
        {mode === 'html' && (
          <div className="w-full max-w-[920px] mx-auto rounded-xl border border-border/70 bg-card shadow-sm p-4">
            <textarea
              ref={htmlTextareaRef}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="w-full h-[420px] font-mono text-xs p-4 rounded-lg border border-border/60 bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              spellCheck={false}
            />
          </div>
        )}
        {mode === 'preview' && (
          <div className={cn('w-full max-w-[920px] mx-auto rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden', device === 'mobile' && 'p-5 flex justify-center')}>
            <iframe
              title="email-preview"
              srcDoc={previewDoc}
              className={cn('bg-white block', device === 'desktop' ? 'w-full h-[560px] border-0' : 'w-[375px] h-[560px] border border-border rounded-xl shadow-sm')}
            />
          </div>
        )}
      </div>

      {/* Footer — premium sticky action bar. On mobile the Send button gets full-bleed prominence
          (Apple-Mail / Gmail mobile-style) so the primary CTA is unmistakable. */}
      <div className="px-3 py-2 lg:px-6 lg:py-3.5 border-t border-border/50 bg-gradient-to-b from-card to-card/80 backdrop-blur-md flex items-center justify-between gap-3 flex-wrap shrink-0 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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
        <div className="flex items-center gap-2 lg:ml-auto w-full lg:w-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openSaveDialog}
            disabled={isPending}
            className="hidden lg:inline-flex h-9 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Save className="h-3.5 w-3.5" />
            Save as template
          </Button>
          <div className="hidden lg:block h-6 w-px bg-border/60 mx-1" />
          {savedAt && (
            <span
              className="hidden lg:inline text-[11px] text-muted-foreground/80 tabular-nums mr-1"
              title={`Draft saved ${new Date(savedAt).toLocaleTimeString()}`}
            >
              Saved
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSendClick}
            disabled={!canSend || isPending}
            className={cn(
              /* Mobile: full-width primary CTA so the Send action reads as the
                 single, unmistakable next step (Apple Mail / Gmail mobile parity).
                 Desktop: compact pill with min-width so the label never wraps. */
              'h-11 lg:h-9 w-full lg:w-auto gap-2 lg:min-w-[160px] px-4 font-semibold text-[13px] lg:text-[12.5px] tracking-[-0.005em] rounded-xl lg:rounded-lg',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.5)] hover:shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.55)]',
              'transition-all disabled:shadow-none disabled:opacity-50',
            )}
          >
            {isPending ? <Loader2 className="h-4 w-4 lg:h-3.5 lg:w-3.5 animate-spin" /> : recipientCount > 1 ? <Users className="h-4 w-4 lg:h-3.5 lg:w-3.5" /> : <Send className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
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
