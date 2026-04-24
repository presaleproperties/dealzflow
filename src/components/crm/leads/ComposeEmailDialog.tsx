import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Send,
  FileText,
  Eye,
  Code2,
  Variable,
  Paperclip,
  X,
  Loader2,
  Monitor,
  Smartphone,
  ChevronDown,
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
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import { useAuth } from '@/hooks/useAuth';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
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

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const addMessage = useAddCrmMessage();
  const sendBridge = useBridgeSendEmail();
  const { data: emailSettings } = useEmailSettings();

  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('edit');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [appendSignature, setAppendSignature] = useState(true);
  const [logOnly, setLogOnly] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSubject('');
      setBodyHtml('<p></p>');
      setCc('');
      setBcc('');
      setShowCcBcc(false);
      setMode('edit');
    }
  }, [open]);

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
    toast.success(`Loaded "${tpl.name}"`);
  };

  const insertVariable = (token: string) => {
    setBodyHtml((prev) => {
      // Naive insert at end of last paragraph
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
      // Also log it locally to the timeline
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

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${finalHtml}</body></html>`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[96vw] h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 py-3 border-b border-border bg-card">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">New Email</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => setPickerOpen(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Templates
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5">
                      <Variable className="h-3.5 w-3.5" />
                      Insert variable
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
                            onClick={() => insertVariable(v.token)}
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
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Recipient row */}
          <div className="px-5 py-3 border-b border-border space-y-2 bg-card">
            <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                value={contact.email ?? ''}
                disabled
                className="h-9 bg-muted/40"
                placeholder={contact.email ? '' : 'No email on file'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => setShowCcBcc((v) => !v)}
              >
                {showCcBcc ? 'Hide' : 'Cc / Bcc'}
              </Button>
            </div>
            {showCcBcc && (
              <>
                <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Cc</Label>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="h-9"
                  />
                  <span className="w-[68px]" />
                </div>
                <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Bcc</Label>
                  <Input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="h-9"
                  />
                  <span className="w-[68px]" />
                </div>
              </>
            )}
            <div className="grid grid-cols-[60px_1fr] items-center gap-2">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line — supports {{lead.first_name}}"
                className="h-9 font-medium"
                maxLength={200}
              />
            </div>
          </div>

          {/* Toolbar / mode tabs */}
          <div className="px-5 py-2 border-b border-border bg-muted/20 flex items-center justify-between gap-2">
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
                    'h-7 px-3 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5',
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
          <div className="flex-1 overflow-y-auto bg-muted/10">
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
                  className="w-full h-[400px] font-mono text-xs p-4 rounded-xl border border-border bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
                    device === 'desktop' ? 'w-full max-w-[680px] h-[520px]' : 'w-[375px] h-[520px]',
                  )}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border bg-card flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
        </DialogContent>
      </Dialog>

      <TemplatePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={applyTemplate} />
    </>
  );
}
