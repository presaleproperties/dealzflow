import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_LEN = 1600;

export function SendSmsDialog({ contact, open, onOpenChange }: Props) {
  const [to, setTo] = useState(contact.phone ?? '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(contact.phone ?? '');
      setBody('');
    }
  }, [open, contact.phone]);

  const handleSend = async () => {
    if (!to.trim() || !body.trim()) {
      toast.error('Phone number and message are required');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { contact_id: contact.id, to: to.trim(), body: body.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('SMS sent');
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const remaining = MAX_LEN - body.length;
  const segments = Math.max(1, Math.ceil(body.length / 160));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Send SMS
          </DialogTitle>
          <DialogDescription>
            Outbound text message via Twilio. Sender number is set in CRM Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div>
            <Label>To</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+15551234567"
            />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
              placeholder={`Hi ${contact.first_name}, …`}
              rows={6}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{segments} segment{segments > 1 ? 's' : ''}</span>
              <span>{remaining} chars left</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending || !to.trim() || !body.trim()}>
              <Send className="w-4 h-4 mr-1.5" /> {sending ? 'Sending…' : 'Send SMS'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
