import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeEmailDialog({ contact, open, onOpenChange }: Props) {
  const addMessage = useAddCrmMessage();
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
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Email subject" maxLength={200} />
          </div>
          <div>
            <Label>Body *</Label>
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write your email..." className="min-h-[150px]" maxLength={5000} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={addMessage.isPending || !form.subject.trim() || !form.body.trim()}>
              {addMessage.isPending ? 'Sending...' : 'Send Email'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
