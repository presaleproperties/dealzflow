import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string | null;
  subject: string;
  html: string;
  defaultEmail?: string | null;
}

/**
 * Sends a one-off test render of the editor's current draft to the caller
 * (or any address). Goes through the `template-send-test` edge fn which
 * forwards to bridge-send-email and writes a row to crm_template_sync_log.
 */
export function SendTestDialog({
  open, onOpenChange, templateId, subject, html, defaultEmail,
}: Props) {
  const [to, setTo] = useState<string>(defaultEmail ?? '');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!subject.trim() || !html.trim()) {
      toast.error('Subject and HTML are required');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('template-send-test', {
        body: {
          template_id: templateId,
          to: to.trim() || null,
          subject,
          html,
        },
      });
      if (error) throw error;
      toast.success(`Test sent to ${(data as any)?.to ?? 'your inbox'}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Test send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>
            Sends the current draft (with your signature) to the address below.
            Subject is prefixed with [TEST]. Not logged to a lead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">To</Label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={defaultEmail ?? 'you@example.com'}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Leave blank to send to your own inbox{defaultEmail ? ` (${defaultEmail})` : ''}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
