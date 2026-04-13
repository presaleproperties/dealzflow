import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, Eye } from 'lucide-react';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const addMessage = useAddCrmMessage();
  const { data: emailSettings } = useEmailSettings();
  const [form, setForm] = useState({ subject: '', body: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) return;

    await addMessage.mutateAsync({
      contact_id: contact.id,
      direction: 'outbound',
      content: `Subject: ${form.subject}\n\n${form.body}`,
      channel: 'email',
      sent_by: 'Agent',
      message_type: 'text',
    });
    setForm({ subject: '', body: '' });
    onOpenChange(false);
  };

  const isPending = addMessage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
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
              disabled={isPending || !form.subject.trim() || !form.body.trim()}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {isPending ? 'Sending...' : 'Log Email'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
