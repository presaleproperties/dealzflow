import { useState, useMemo, useEffect, useRef, type ComponentType } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
} from 'lucide-react';
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
import { useEmailSignatures } from '@/hooks/useEmailSignatures';
import { useAddCrmMessage, useCrmContactMessages } from '@/hooks/useCrmLeadDetail';
import { useAuth } from '@/hooks/useAuth';
import { useBridgeSendEmail, useBridgeTemplates } from '@/hooks/useBridgeEmail';
import { useCrmEmailTemplates, useCreateTemplate } from '@/hooks/useCrmEmail';
import { TemplatePicker } from '@/components/crm/email/TemplatePicker';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
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

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const addMessage = useAddCrmMessage();
  const sendBridge = useBridgeSendEmail();
  const createTemplate = useCreateTemplate();
  const { data: emailSettings } = useEmailSettings();
  const { data: signatures = [] } = useEmailSignatures();
  const { data: localTemplates = [] } = useCrmEmailTemplates();
  const { data: bridgeTemplates = [] } = useBridgeTemplates();
  const { data: messages = [] } = useCrmContactMessages(open ? contact.id : undefined);

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

  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('general');
  const [previewTpl, setPreviewTpl] = useState<AnyTpl | null>(null);
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varSearch, setVarSearch] = useState('');

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
      setSelectedSignatureId(null);
    }
  }, [open]);

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

  const recentEmails = useMemo(
    () =>
      messages
        .filter((m: any) => m.channel === 'email')
        .slice(0, 4),
    [messages],
  );

  const applyTemplate = (tpl: AnyTpl) => {
    setSubject(tpl.subject || '');
    setBodyHtml(tpl.body_html || '<p></p>');
    /* Templates are full HTML emails (tables, inline styles, images) that the
       rich text editor cannot represent without flattening to plain text.
       Switch to Preview so the user sees the real design immediately, and
       leave HTML mode available for source-level tweaks. */
    setMode('preview');
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

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${finalHtml}</body></html>`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl w-[98vw] h-[92vh] p-0 overflow-hidden flex flex-col">
          {/* Header */}
          <DialogHeader className="px-5 py-3 border-b border-border bg-card shrink-0">
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
                <Popover open={varPickerOpen} onOpenChange={(o) => { setVarPickerOpen(o); if (!o) setVarSearch(''); }}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5">
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
                        key={m.id}
                        className="text-[11px] bg-card border border-border rounded-md p-2"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
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
                        </div>
                        <p className="line-clamp-2 text-foreground/80">
                          {(m.content ?? '').slice(0, 120)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            {/* Main composer column */}
            <div className="flex flex-col overflow-hidden min-h-0">
              {/* Recipient rows */}
              <div className="px-5 py-3 border-b border-border space-y-2 bg-card shrink-0">
                <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    value={emailSettings?.sender_name ? `${emailSettings.sender_name} <${emailSettings.reply_to ?? user?.email ?? ''}>` : (user?.email ?? '')}
                    disabled
                    className="h-9 bg-muted/40 text-xs"
                  />
                  <span className="w-[68px]" />
                </div>
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

              {/* Mode tabs */}
              <div className="px-5 py-2 border-b border-border bg-muted/20 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1">
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
                          'h-7 px-3 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5',
                          mode === t.v
                            ? 'bg-background border border-border text-foreground shadow-sm'
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

              {/* Body area */}
              <div className="flex-1 overflow-y-auto bg-muted/10 min-h-0">
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
                  <div
                    className={cn(
                      'h-full w-full flex justify-center',
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

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border bg-card flex items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appendSignature}
                      onChange={(e) => setAppendSignature(e.target.checked)}
                      className="rounded border-border"
                    />
                    Append signature
                  </label>
                  {appendSignature && signatures.length > 0 && (
                    <select
                      value={selectedSignatureId ?? ''}
                      onChange={(e) => setSelectedSignatureId(e.target.value || null)}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 max-w-[180px]"
                      title="Choose which signature to append"
                    >
                      {signatures.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
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
        </DialogContent>
      </Dialog>

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
