import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Loader2, Upload, ArrowDownLeft, ArrowUpRight, Mail, MessageSquare, Phone, Voicemail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';

type ParsedMsg = {
  channel: 'email' | 'sms' | 'whatsapp' | 'call' | 'voicemail' | 'chat';
  direction: 'inbound' | 'outbound';
  timestamp: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body: string;
};

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHANNEL_ICON = {
  email: Mail, sms: MessageSquare, whatsapp: MessageSquare,
  call: Phone, voicemail: Voicemail, chat: MessageSquare,
} as const;

const CHANNEL_LABEL: Record<ParsedMsg['channel'], string> = {
  email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', call: 'Call', voicemail: 'Voicemail', chat: 'Chat',
};

export function ImportConversationDialog({ contact, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'paste' | 'preview' | 'saving'>('paste');
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [messages, setMessages] = useState<ParsedMsg[]>([]);
  const [summary, setSummary] = useState('');

  const reset = () => {
    setStep('paste'); setRawText(''); setMessages([]); setSummary(''); setParsing(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const parse = async () => {
    if (rawText.trim().length < 10) {
      toast.error('Paste at least a few lines of conversation.');
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-conversation', {
        body: { raw_text: rawText, contact_id: contact.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const msgs = (data?.messages || []) as ParsedMsg[];
      if (msgs.length === 0) {
        toast.error("AI couldn't find any messages in that text. Try pasting more context.");
        return;
      }
      setMessages(msgs);
      setSummary(data?.summary || '');
      setStep('preview');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to parse conversation');
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!user) { toast.error('Not signed in'); return; }
    setStep('saving');
    try {
      const emailRows: any[] = [];
      const smsRows: any[] = [];
      const noteRows: any[] = [];

      for (const m of messages) {
        const ts = m.timestamp || new Date().toISOString();
        if (m.channel === 'email') {
          emailRows.push({
            contact_id: contact.id,
            user_id: user.id,
            subject: m.subject || '(imported from Lofty)',
            body: m.body,
            direction: m.direction,
            sent_at: ts,
          });
        } else if (m.channel === 'sms' || m.channel === 'whatsapp' || m.channel === 'chat') {
          smsRows.push({
            contact_id: contact.id,
            user_id: user.id,
            direction: m.direction,
            channel: m.channel === 'whatsapp' ? 'whatsapp' : 'sms',
            to_number: m.direction === 'outbound' ? (m.to || contact.phone || '') : (contact.phone || ''),
            from_number: m.direction === 'inbound' ? (m.from || contact.phone || '') : null,
            body: m.body,
            status: 'delivered',
            sent_at: ts,
            message_type: 'sms',
          });
        } else {
          // call / voicemail → notes
          const prefix = m.channel === 'voicemail' ? '📩 Voicemail' : '📞 Call';
          const dirLabel = m.direction === 'inbound' ? 'inbound' : 'outbound';
          noteRows.push({
            contact_id: contact.id,
            user_id: user.id,
            content: `${prefix} (${dirLabel})${m.from ? ` · ${m.from}` : ''}\n\n${m.body}`,
            note_type: 'call_log',
            event_at: ts,
          });
        }
      }

      // Always add a top-level summary note
      noteRows.push({
        contact_id: contact.id,
        user_id: user.id,
        content: `📥 **Imported from Lofty** · ${messages.length} message${messages.length === 1 ? '' : 's'}\n\n${summary || '(no summary)'}`,
        note_type: 'import_archive',
      });

      const errors: string[] = [];
      if (emailRows.length) {
        const { error } = await supabase.from('crm_email_log').insert(emailRows);
        if (error) errors.push(`emails: ${error.message}`);
      }
      if (smsRows.length) {
        const { error } = await supabase.from('crm_sms_log').insert(smsRows);
        if (error) errors.push(`messages: ${error.message}`);
      }
      if (noteRows.length) {
        const { error } = await supabase.from('crm_notes').insert(noteRows);
        if (error) errors.push(`notes: ${error.message}`);
      }

      if (errors.length) throw new Error(errors.join(' · '));

      toast.success(`Imported ${messages.length} message${messages.length === 1 ? '' : 's'}`);
      // Refresh detail caches
      queryClient.invalidateQueries({ queryKey: ['crm-notes', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-contact-messages', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['lead-notes', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-email-log', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-sms-log', contact.id] });
      handleClose(false);
    } catch (e) {
      setStep('preview');
      toast.error(e instanceof Error ? e.message : 'Failed to save imported messages');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Import conversation from Lofty
          </DialogTitle>
          <DialogDescription>
            Paste the full email thread, text exchange, or call notes. AI will recognize each message and lay it out chronologically.
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste the entire conversation here…\n\nFrom: jane@example.com\nDate: Apr 21, 2026 10:14 AM\nSubject: Re: Lumina condo\n\nHi! I'd love to see the 2-bedroom unit on Saturday…`}
              className="flex-1 min-h-[280px] text-sm font-mono"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: include headers like <code>From:</code>, <code>Sent:</code>, dates, and quoted replies. The more context, the better the parsing.
            </p>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {summary && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">AI Summary</div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{summary}</p>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{messages.length} message{messages.length === 1 ? '' : 's'} detected</span>
              <button onClick={() => setStep('paste')} className="text-primary hover:underline font-medium">
                ← Edit raw text
              </button>
            </div>
            <ScrollArea className="flex-1 rounded-lg border border-border">
              <div className="p-3 space-y-2.5">
                {messages.map((m, i) => {
                  const Icon = CHANNEL_ICON[m.channel] || MessageSquare;
                  const isOut = m.direction === 'outbound';
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${isOut ? 'bg-primary/5 border-primary/20 ml-8' : 'bg-card border-border mr-8'}`}
                    >
                      <div className="flex items-center gap-2 mb-1.5 text-[10.5px] uppercase tracking-[0.08em] font-semibold">
                        <Icon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground/80">{CHANNEL_LABEL[m.channel]}</span>
                        <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] font-bold gap-1">
                          {isOut ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownLeft className="w-2.5 h-2.5" />}
                          {isOut ? 'OUT' : 'IN'}
                        </Badge>
                        {m.timestamp && (
                          <span className="text-muted-foreground normal-case tracking-normal font-medium">
                            · {(() => {
                              try { return format(new Date(m.timestamp), 'MMM d, yyyy · h:mm a'); }
                              catch { return m.timestamp; }
                            })()}
                          </span>
                        )}
                      </div>
                      {m.subject && (
                        <div className="text-[12px] font-semibold text-foreground mb-1 truncate">{m.subject}</div>
                      )}
                      {(m.from || m.to) && (
                        <div className="text-[10.5px] text-muted-foreground mb-1.5">
                          {m.from && <>From <span className="text-foreground/80">{m.from}</span></>}
                          {m.from && m.to && ' · '}
                          {m.to && <>To <span className="text-foreground/80">{m.to}</span></>}
                        </div>
                      )}
                      <p className="text-[13px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          {step === 'paste' && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={parse} disabled={parsing || rawText.trim().length < 10} className="gap-1.5">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {parsing ? 'Parsing…' : 'Parse with AI'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={save} className="gap-1.5">
                <Upload className="w-4 h-4" />
                Import {messages.length} message{messages.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {step === 'saving' && (
            <Button disabled className="gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
