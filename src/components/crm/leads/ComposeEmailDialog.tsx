import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  X,
  Plus,
  Mail,
  Clock,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useAddCrmMessage, useCrmContactMessages } from '@/hooks/useCrmLeadDetail';
import { useAuth } from '@/hooks/useAuth';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates, useCreateTemplate } from '@/hooks/useCrmEmail';
import { useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { Dialog as InnerDialog, DialogContent as InnerDialogContent, DialogHeader as InnerDialogHeader, DialogTitle as InnerDialogTitle, DialogFooter as InnerDialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { TemplatePicker } from '@/components/crm/email/TemplatePicker';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { EMAIL_VARIABLES, renderForRecipient } from '@/lib/emailVariables';
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

const RECENT_KEY = 'crm:email:recent-templates';

function readRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function pushRecentId(id: string) {
  try {
    const cur = readRecentIds().filter((x) => x !== id);
    cur.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 8)));
  } catch {
    /* noop */
  }
}

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const addMessage = useAddCrmMessage();
  const sendBridge = useBridgeSendEmail();
  const { data: emailSettings } = useEmailSettings();
  const { data: localTemplates = [] } = useCrmEmailTemplates();
  const { data: bridgeTemplates = [] } = useBridgeTemplates();
  const { data: messages = [] } = useCrmContactMessages(contact.id);

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [appendSignature, setAppendSignature] = useState(true);
  const [logOnly, setLogOnly] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [activeTplId, setActiveTplId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('general');
  const createTemplate = useCreateTemplate();

  useEffect(() => {
    if (open) setRecentIds(readRecentIds());
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSubject('');
      setBodyHtml('<p></p>');
      setCc('');
      setBcc('');
      setShowCc(false);
      setShowBcc(false);
      setMode('edit');
      setActiveTplId(null);
    }
  }, [open]);

  const allTemplates = useMemo(() => {
    return [
      ...bridgeTemplates.map((t) => ({ ...t, __source: 'presale' as const })),
      ...localTemplates.map((t) => ({ ...t, __source: 'local' as const })),
    ];
  }, [localTemplates, bridgeTemplates]);

  const sidebarTemplates = useMemo(() => {
    const byId = new Map(allTemplates.map((t) => [t.id, t]));
    const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as typeof allTemplates;
    if (recent.length >= 6) return recent.slice(0, 8);
    // Pad with most recently created
    const fillers = allTemplates
      .filter((t) => !recentIds.includes(t.id))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 8 - recent.length);
    return [...recent, ...fillers];
  }, [allTemplates, recentIds]);

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
        signature: emailSettings?.signature_html ?? '',
      },
    }),
    [contact, emailSettings, user],
  );

  const finalHtml = useMemo(() => {
    const merged = renderForRecipient(bodyHtml, senderCtx);
    if (appendSignature && emailSettings?.signature_html) {
      return `${merged}<br/><br/>${emailSettings.signature_html}`;
    }
    return merged;
  }, [bodyHtml, senderCtx, appendSignature, emailSettings]);

  const renderedSubject = useMemo(
    () => renderForRecipient(subject, senderCtx),
    [subject, senderCtx],
  );

  const applyTemplate = (tpl: CrmEmailTemplate) => {
    setSubject(tpl.subject || '');
    setBodyHtml(tpl.body_html || '<p></p>');
    setActiveTplId(tpl.id);
    pushRecentId(tpl.id);
    setRecentIds(readRecentIds());
    toast.success(`Loaded "${tpl.name}"`);
  };

  const insertVariable = (token: string) => {
    setBodyHtml((prev) => {
      const insert = `{{${token}}}`;
      if (!prev || prev === '<p></p>') return `<p>${insert}</p>`;
      return prev.replace(/<\/p>\s*$/, `${insert}</p>`) || `${prev}${insert}`;
    });
  };

  const canSend = !!contact.email && subject.trim() && bodyHtml.replace(/<[^>]*>/g, '').trim();

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

  const openSaveDialog = () => {
    if (!subject.trim() && !bodyHtml.replace(/<[^>]*>/g, '').trim()) {
      toast.error('Add a subject or body before saving');
      return;
    }
    setSaveName(subject.trim() || 'Untitled template');
    setSaveOpen(true);
  };

  const handleSaveTemplate = async () => {
    const name = saveName.trim();
    if (!name) {
      toast.error('Template name is required');
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name,
        subject: subject.trim() || name,
        body_html: bodyHtml,
        category: saveCategory || 'general',
      });
      setSaveOpen(false);
    } catch {
      /* toast handled in hook */
    }
  };

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${finalHtml}</body></html>`;

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  const recentEmailMessages = messages
    .filter((m: any) => m.channel === 'email')
    .slice(0, 4);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[1200px] w-[97vw] h-[92vh] p-0 overflow-hidden flex flex-col gap-0"
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Top bar */}
          <div className="h-12 px-5 flex items-center justify-between border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] text-foreground">NEW EMAIL</span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 flex min-h-0">
            {/* LEFT SIDEBAR */}
            <aside className="w-[300px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
              {/* Contact identity */}
              <div className="p-5 border-b border-border">
                <h2 className="text-[17px] font-bold text-foreground leading-tight uppercase tracking-tight">
                  {fullName || 'Unnamed Lead'}
                </h2>
                <dl className="mt-4 space-y-2 text-[13px]">
                  {contact.lead_type && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Type:</dt>
                      <dd className="font-medium text-foreground">{contact.lead_type}</dd>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Phone:</dt>
                      <dd className="font-medium text-foreground">{contact.phone}</dd>
                    </div>
                  )}
                  {contact.status && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Pipeline:</dt>
                      <dd className="font-medium text-foreground">{contact.status}</dd>
                    </div>
                  )}
                  {contact.source && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground">Source:</dt>
                      <dd className="font-medium text-foreground">{contact.source}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Recent templates */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Recent Templates
                  </h3>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Browse all
                  </button>
                </div>
                {sidebarTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    No templates yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sidebarTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className={cn(
                          'w-full text-left rounded-lg border overflow-hidden transition-all group bg-card',
                          activeTplId === tpl.id
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/40 hover:shadow-sm',
                        )}
                      >
                        <div className="relative h-[110px] bg-white border-b border-border/60 overflow-hidden">
                          <TemplateThumb html={tpl.body_html || ''} />
                          <span
                            className={cn(
                              'absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider',
                              tpl.__source === 'presale'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {tpl.__source === 'presale' ? 'Presale' : 'Local'}
                          </span>
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">
                            {tpl.name}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                            {tpl.subject || 'No subject'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent communications */}
              {recentEmailMessages.length > 0 && (
                <div className="p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Recent Communications ({recentEmailMessages.length})
                  </h3>
                  <div className="space-y-2">
                    {recentEmailMessages.map((m: any) => {
                      const subj = (m.content || '').match(/Subject:\s*(.+)/)?.[1]?.split('\n')[0] || 'Email';
                      const when = m.created_at
                        ? new Date(m.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '';
                      return (
                        <div key={m.id} className="text-[12px] py-1.5 border-l-2 border-border pl-2.5">
                          <p className="font-semibold text-foreground truncate leading-tight">{subj}</p>
                          <p className="text-[10.5px] text-muted-foreground mt-0.5">
                            {m.sent_by || 'Agent'} · {when}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>

            {/* MAIN COMPOSER */}
            <main className="flex-1 flex flex-col min-w-0 bg-background">
              {/* Header rows: From / To / Cc / Bcc */}
              <div className="px-6 pt-4 pb-2 space-y-1.5 border-b border-border">
                <Row label="From">
                  <span className="text-[14px] text-foreground font-medium">
                    {emailSettings?.reply_to || user?.email || '—'}
                  </span>
                  <div className="ml-auto flex items-center gap-3 text-[13px]">
                    {!showCc && (
                      <button
                        onClick={() => setShowCc(true)}
                        className="text-primary font-medium hover:underline"
                      >
                        Add CC
                      </button>
                    )}
                    {!showBcc && (
                      <button
                        onClick={() => setShowBcc(true)}
                        className="text-primary font-medium hover:underline"
                      >
                        Add BCC
                      </button>
                    )}
                  </div>
                </Row>

                <Row label="To">
                  <div className="flex flex-wrap gap-1.5 items-center flex-1">
                    {contact.email ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[13px] font-medium">
                        {contact.email}
                      </span>
                    ) : (
                      <span className="text-[13px] text-destructive">No email on file</span>
                    )}
                  </div>
                </Row>

                {showCc && (
                  <Row label="Cc">
                    <Input
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="cc@example.com"
                      className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 text-[13px]"
                    />
                    <button
                      onClick={() => { setShowCc(false); setCc(''); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Row>
                )}
                {showBcc && (
                  <Row label="Bcc">
                    <Input
                      value={bcc}
                      onChange={(e) => setBcc(e.target.value)}
                      placeholder="bcc@example.com"
                      className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 text-[13px]"
                    />
                    <button
                      onClick={() => { setShowBcc(false); setBcc(''); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Row>
                )}
              </div>

              {/* Subject + template/variable controls */}
              <div className="px-6 py-2 border-b border-border flex items-center gap-3">
                <span className="text-[13px] font-semibold text-foreground shrink-0">Subject:</span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject — supports {{lead.first_name}}"
                  className="h-9 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 text-[14px] font-medium flex-1"
                  maxLength={200}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[12px] gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setPickerOpen(true)}
                >
                  <FileText className="h-3 w-3" />
                  Template
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <span className="text-border">|</span>
                <VariableMenu onInsert={insertVariable} />
              </div>

              {/* Mode toolbar */}
              <div className="px-6 py-1.5 border-b border-border bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {([
                    { v: 'edit', label: 'Editor', icon: FileText },
                    { v: 'html', label: 'HTML', icon: Code2 },
                    { v: 'preview', label: 'Preview', icon: Eye },
                  ] as const).map((t) => (
                    <button
                      key={t.v}
                      onClick={() => setMode(t.v)}
                      className={cn(
                        'h-7 px-2.5 text-[12px] rounded-md font-medium transition-colors flex items-center gap-1.5',
                        mode === t.v
                          ? 'bg-background border border-border text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <t.icon className="h-3 w-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
                {mode === 'preview' && (
                  <div className="flex items-center gap-1">
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

              {/* Body */}
              <div className="flex-1 overflow-y-auto bg-muted/5 min-h-0">
                {mode === 'edit' && (
                  <div className="p-5">
                    <RichTextEditor
                      content={bodyHtml}
                      onChange={setBodyHtml}
                      placeholder="Write your message... use {{lead.first_name}} for personalization."
                    />
                  </div>
                )}
                {mode === 'html' && (
                  <div className="p-5">
                    <textarea
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      className="w-full h-[420px] font-mono text-xs p-4 rounded-xl border border-border bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      spellCheck={false}
                    />
                  </div>
                )}
                {mode === 'preview' && (
                  <div className="p-5 flex justify-center">
                    <iframe
                      title="email-preview"
                      srcDoc={previewDoc}
                      className={cn(
                        'bg-white border border-border rounded-xl shadow-sm transition-all',
                        device === 'desktop' ? 'w-full max-w-[680px] h-[540px]' : 'w-[375px] h-[540px]',
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appendSignature}
                      onChange={(e) => setAppendSignature(e.target.checked)}
                      className="rounded border-border"
                    />
                    Append signature
                  </label>
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
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={openSaveDialog}
                    disabled={isPending}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save as template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
                    disabled={isPending}
                  >
                    {mode === 'preview' ? 'Back to edit' : 'Preview'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSend}
                    disabled={!canSend || isPending}
                    className="gap-1.5 min-w-[110px]"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {isPending ? 'Sending...' : logOnly ? 'Log Email' : 'Send'}
                  </Button>
                </div>
              </div>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={applyTemplate} />

      <InnerDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <InnerDialogContent className="max-w-md">
          <InnerDialogHeader>
            <InnerDialogTitle>Save as template</InnerDialogTitle>
          </InnerDialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Template name</Label>
              <Input
                id="tpl-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Presale follow-up — week 1"
                autoFocus
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject (saved with template)"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-cat" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</Label>
              <select
                id="tpl-cat"
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="general">General</option>
                <option value="follow-up">Follow-up</option>
                <option value="nurture">Nurture</option>
                <option value="welcome">Welcome</option>
                <option value="project-launch">Project launch</option>
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Saved to your shared CRM template library. Merge tags like <code className="px-1 rounded bg-muted">{'{{lead.first_name}}'}</code> are preserved.
            </p>
          </div>
          <InnerDialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)} disabled={createTemplate.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={!saveName.trim() || createTemplate.isPending} className="gap-1.5 min-w-[120px]">
              {createTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save template
            </Button>
          </InnerDialogFooter>
        </InnerDialogContent>
      </InnerDialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[32px]">
      <span className="text-[13px] font-semibold text-muted-foreground w-12 shrink-0">{label}:</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

function VariableMenu({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[12px] gap-1 text-muted-foreground hover:text-foreground"
        >
          <Variable className="h-3 w-3" />
          Variable
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[420px] overflow-y-auto w-64">
        {['Lead', 'Sender', 'Co-Buyer', 'Links', 'System'].map((group) => (
          <div key={group}>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group}
            </DropdownMenuLabel>
            {EMAIL_VARIABLES.filter((v) => v.group === group).map((v) => (
              <DropdownMenuItem
                key={v.token}
                onClick={() => onInsert(v.token)}
                className="text-xs flex flex-col items-start gap-0.5"
              >
                <span className="font-medium">{v.label}</span>
                <code className="text-[10px] text-muted-foreground">{`{{${v.token}}}`}</code>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
