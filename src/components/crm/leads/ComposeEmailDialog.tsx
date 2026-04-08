import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Send, Eye } from 'lucide-react';
import { useSendGmail, useGmailStatus } from '@/hooks/useGmail';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const sendGmail = useSendGmail();
  const addMessage = useAddCrmMessage();
  const { data: gmailStatus } = useGmailStatus();
  const { data: emailSettings } = useEmailSettings();
  const [form, setForm] = useState({ subject: '', body: '' });

  const isGmailConnected = gmailStatus?.connected ?? false;
  const gmailEmail = gmailStatus?.gmailEmail;
  const senderName = emailSettings?.sender_name;
  const fromDisplay = isGmailConnected && gmailEmail
    ? (senderName ? `${senderName} <${gmailEmail}>` : gmailEmail)
    : 'Not connected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) return;

    if (isGmailConnected && contact.email) {
      // Send via Gmail
      await sendGmail.mutateAsync({
        to: contact.email,
        subject: form.subject,
        bodyText: form.body,
        contactId: contact.id,
      });
    } else {
      // Fallback: just log in CRM messages
      await addMessage.mutateAsync({
        contact_id: contact.id,
        direction: 'outbound',
        content: `Subject: ${form.subject}\n\n${form.body}`,
        channel: 'email',
        sent_by: 'Agent',
        message_type: 'text',
      });
    }
    setForm({ subject: '', body: '' });
    onOpenChange(false);
  };

  const isPending = sendGmail.isPending || addMessage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>

        {!isGmailConnected && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span className="text-amber-700 dark:text-amber-400">
              Gmail not connected. Email will be logged but not sent. Connect Gmail in CRM Settings.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label>From</Label>
            <Input value={fromDisplay} disabled className="bg-muted text-xs" />
          </div>
          <div>
            <Label>To</Label>
            <Input value={contact.email ?? '—'} disabled className="bg-muted" />
          </div>
          <div>
            <Label>Subject *</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Email subject"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Body *</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Write your email..."
              className="min-h-[150px]"
              maxLength={10000}
            />
          </div>

          {/* Signature Preview */}
          {emailSettings?.signature_html && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" /> Signature (auto-appended)
              </div>
              <div className="rounded-md border border-border/30 bg-muted/10 p-3 opacity-70">
                <div className="text-xs text-muted-foreground mb-1">--</div>
                <div dangerouslySetInnerHTML={{ __html: emailSettings.signature_html }} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={isPending || !form.subject.trim() || !form.body.trim() || (!isGmailConnected && !contact.email)}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {isPending ? 'Sending...' : isGmailConnected ? 'Send via Gmail' : 'Log Email'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
