import { useState, useRef, useMemo } from 'react';
import {
  Send, Phone, StickyNote, Clock, Mail, MessageSquare, Settings2, Loader2, Sparkles, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAddNote } from '@/hooks/useCrmNotes';
import { useSendSms, smsSegments, type MessagingChannel } from '@/hooks/useSms';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
import { renderForRecipient } from '@/lib/emailVariables';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import { useLeadQuickReplies } from '@/hooks/useLeadQuickReplies';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';

type Mode = 'note' | 'call' | 'email' | 'text';

const MODES: { key: Mode; label: string; icon: typeof StickyNote; tint: string }[] = [
  { key: 'note',  label: 'Note',     icon: StickyNote,    tint: '45 90% 55%' },
  { key: 'call',  label: 'Log Call', icon: Phone,         tint: '142 70% 45%' },
  { key: 'email', label: 'Email',    icon: Mail,          tint: '210 90% 56%' },
  { key: 'text',  label: 'Text',     icon: MessageSquare, tint: '280 70% 60%' },
];

const CALL_OUTCOMES = ['Connected', 'Voicemail', 'No answer', 'Busy', 'Wrong number', 'Not interested'];

interface Props {
  contact: CrmContact;
}

/**
 * Quick composer — Note / Call Log / Email / Text inline on the lead page.
 * No modal needed for the common case. Use the "Advanced" link to open the
 * full dialog (templates, scheduling, MMS, CC/BCC).
 */
export function QuickActionBar({ contact }: Props) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const presaleAgent = usePresaleAgentStore((s) => s.agent);

  const [mode, setMode] = useState<Mode>('note');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [textChannel, setTextChannel] = useState<MessagingChannel>('sms');
  const [callDuration, setCallDuration] = useState('');
  const [callOutcome, setCallOutcome] = useState(CALL_OUTCOMES[0]);
  const [showAdvancedEmail, setShowAdvancedEmail] = useState(false);
  const [showAdvancedText, setShowAdvancedText] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const addNote = useAddNote();
  const sendSms = useSendSms();
  const sendEmail = useBridgeSendEmail();

  // AI quick-reply chips — only fetched when user is in email/text mode
  const quickReplyMode: 'email' | 'text' = mode === 'email' ? 'email' : 'text';
  const quickReplies = useLeadQuickReplies(
    contact.id,
    quickReplyMode,
    mode === 'email' || mode === 'text',
  );

  const sender = useMemo(() => {
    const fullName = profile?.full_name || presaleAgent?.name || user?.email || '';
    const firstName = fullName.split(' ')[0] || '';
    return {
      first_name: firstName,
      full_name: fullName,
      email: user?.email || presaleAgent?.email || '',
      phone: profile?.phone || presaleAgent?.phone || '',
      signature: presaleAgent?.signatureHtml || '',
    };
  }, [profile, presaleAgent, user]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const reset = () => {
    setBody('');
    setSubject('');
    setCallDuration('');
    setCallOutcome(CALL_OUTCOMES[0]);
  };

  const save = async () => {
    if (mode === 'note') {
      if (!body.trim()) return;
      addNote.mutate(
        { contact_id: contact.id, content: body.trim(), note_type: 'manual' },
        { onSuccess: reset },
      );
      return;
    }
    if (mode === 'call') {
      if (!body.trim() && !callDuration && !callOutcome) return;
      const lines = [
        `📞 ${callOutcome}${callDuration ? ` · ${callDuration} min` : ''}`,
        body.trim(),
      ].filter(Boolean);
      addNote.mutate(
        { contact_id: contact.id, content: lines.join('\n\n'), note_type: 'call_log' },
        { onSuccess: reset },
      );
      return;
    }
    if (mode === 'email') {
      if (!contact.email) {
        toast.error('This lead has no email address');
        return;
      }
      if (!subject.trim() || !body.trim()) return;
      // Build minimal HTML: paragraphs from line breaks + signature
      const escaped = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const paragraphs = escaped
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 1em">${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
      const sigBlock = sender.signature
        ? `<div style="margin-top:1.5em">${sender.signature}</div>`
        : '';
      const rawHtml = `${paragraphs}${sigBlock}`;
      const html = renderForRecipient(rawHtml, { lead: contact as any, sender });
      const renderedSubject = renderForRecipient(subject, { lead: contact as any, sender });
      try {
        await sendEmail.mutateAsync({
          to: contact.email,
          subject: renderedSubject,
          html,
          contact_id: contact.id,
        });
        reset();
      } catch {
        // toast handled by hook
      }
      return;
    }
    if (mode === 'text') {
      if (!contact.phone) {
        toast.error('This lead has no phone number');
        return;
      }
      if (!body.trim()) return;
      try {
        await sendSms.mutateAsync({
          contact_id: contact.id,
          to: contact.phone,
          body: body.trim(),
          channel: textChannel,
        });
        reset();
      } catch {
        // toast handled by hook
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  const placeholder =
    mode === 'note' ? `What happened with ${contact.first_name || 'this lead'}?`
    : mode === 'call' ? 'Call notes — what was discussed, next steps…'
    : mode === 'email' ? `Hi ${contact.first_name || 'there'},\n\n…\n\nUse {{lead.first_name}}, {{sender.full_name}} etc.`
    : `Reply to ${contact.first_name || 'this lead'}…`;

  const isPending = addNote.isPending || sendSms.isPending || sendEmail.isPending;

  const canSave =
    (mode === 'note'  && body.trim().length > 0) ||
    (mode === 'call'  && (body.trim().length > 0 || !!callDuration)) ||
    (mode === 'email' && body.trim().length > 0 && subject.trim().length > 0 && !!contact.email) ||
    (mode === 'text'  && body.trim().length > 0 && !!contact.phone);

  const segInfo = mode === 'text' ? smsSegments(body) : null;

  const sendLabel =
    mode === 'email' ? 'Send Email'
    : mode === 'text' ? `Send ${textChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`
    : mode === 'call' ? 'Log Call'
    : 'Save Note';

  return (
    <>
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Mode chip rail */}
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-border/60 overflow-x-auto bg-muted/30">
        {MODES.map((m) => {
          const active = mode === m.key;
          const Icon = m.icon;
          const disabled =
            (m.key === 'email' && !contact.email) ||
            (m.key === 'text' && !contact.phone);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => !disabled && switchMode(m.key)}
              disabled={disabled}
              title={disabled ? `Lead is missing ${m.key === 'email' ? 'email' : 'phone'}` : undefined}
              className={cn(
                'group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all border',
                active ? 'shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card',
                disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground',
              )}
              style={
                active
                  ? {
                      background: `hsl(${m.tint} / 0.10)`,
                      borderColor: `hsl(${m.tint} / 0.40)`,
                      color: `hsl(${m.tint})`,
                    }
                  : undefined
              }
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Composer body */}
      <div className="p-3 space-y-2.5">
        {mode === 'call' && (
          <div className="grid grid-cols-2 gap-2">
            <Select value={callOutcome} onValueChange={setCallOutcome}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALL_OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={callDuration}
                onChange={(e) => setCallDuration(e.target.value)}
                placeholder="Duration (min)"
                className="h-9 text-sm pl-8"
              />
            </div>
          </div>
        )}

        {mode === 'email' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.1em]">To:</span>
              <span className="truncate text-foreground/80">{contact.email}</span>
            </div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-9 text-sm"
            />
          </div>
        )}

        {mode === 'text' && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold uppercase tracking-[0.1em] shrink-0">To:</span>
              <span className="truncate text-foreground/80">{contact.phone}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 rounded-md border border-border/60 p-0.5 bg-muted/40">
              {(['sms', 'whatsapp'] as MessagingChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextChannel(c)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors',
                    textChannel === c ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                </button>
              ))}
            </div>
          </div>
        )}

        {(mode === 'email' || mode === 'text') && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-0.5 px-0.5">
            <div className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold shrink-0 pr-1">
              <Sparkles className="w-3 h-3" />
              AI
            </div>
            {quickReplies.isLoading ? (
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-7 w-28 rounded-full bg-muted/50 animate-pulse shrink-0" />
                ))}
              </div>
            ) : quickReplies.data && quickReplies.data.length > 0 ? (
              <>
                {quickReplies.data.slice(0, 3).map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setBody(r.body);
                      setTimeout(() => taRef.current?.focus(), 0);
                    }}
                    title={r.body}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border/60 bg-muted/30 hover:bg-muted hover:border-border text-foreground/90 transition-colors"
                  >
                    {r.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => quickReplies.refetch()}
                  disabled={quickReplies.isFetching}
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                  title="Regenerate"
                >
                  <RefreshCw className={cn('w-3 h-3', quickReplies.isFetching && 'animate-spin')} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => quickReplies.refetch()}
                disabled={quickReplies.isFetching}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
              >
                {quickReplies.isFetching
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                Suggest replies
              </button>
            )}
          </div>
        )}

        <Textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            'text-sm resize-none border-border/60 focus-visible:ring-1',
            mode === 'email' ? 'min-h-[140px]' : 'min-h-[72px]',
          )}
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold">
              ⌘ + Enter to send
            </span>
            {mode === 'text' && segInfo && body && (
              <span className="text-[10.5px] tabular-nums text-muted-foreground/70 font-medium">
                {segInfo.chars}ch · {segInfo.count} seg
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(mode === 'email' || mode === 'text') && (
              <button
                type="button"
                onClick={() => mode === 'email' ? setShowAdvancedEmail(true) : setShowAdvancedText(true)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium"
                title="Open full composer (templates, scheduling, attachments)"
              >
                <Settings2 className="w-3 h-3" />
                Advanced
              </button>
            )}
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={save}
              disabled={!canSave || isPending}
            >
              {isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              {sendLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <ComposeEmailDialog contact={contact} open={showAdvancedEmail} onOpenChange={setShowAdvancedEmail} />
    <SendTextDialog contact={contact} open={showAdvancedText} onOpenChange={setShowAdvancedText} initialChannel={textChannel} />
    </>
  );
}
