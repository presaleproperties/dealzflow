import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddConversation } from '@/hooks/useConversations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLeadModal({ open, onOpenChange }: Props) {
  const addConversation = useAddConversation();
  const [form, setForm] = useState({
    lead_name: '',
    lead_phone: '',
    lead_email: '',
    channel: 'whatsapp' as const,
    status: 'new' as const,
    assigned_to: 'zara' as const,
    heat: 50,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_name.trim()) return;
    addConversation.mutate({
      ...form,
      lead_id: null,
      external_id: null,
      last_message_at: null,
      meta_window_expires_at: null,
      lofty_contact_id: null,
      avatar_url: null,
    });
    onOpenChange(false);
    setForm({ lead_name: '', lead_phone: '', lead_email: '', channel: 'whatsapp', status: 'new', assigned_to: 'zara', heat: 50 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Add New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <Label className="text-[12px] font-medium">Name *</Label>
            <Input
              value={form.lead_name}
              onChange={e => setForm(f => ({ ...f, lead_name: e.target.value }))}
              placeholder="John Smith"
              className="mt-1 h-9 text-[13px]"
              required
            />
          </div>
          <div>
            <Label className="text-[12px] font-medium">Phone</Label>
            <Input
              value={form.lead_phone}
              onChange={e => setForm(f => ({ ...f, lead_phone: e.target.value }))}
              placeholder="+1 604 123 4567"
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[12px] font-medium">Email</Label>
            <Input
              value={form.lead_email}
              onChange={e => setForm(f => ({ ...f, lead_email: e.target.value }))}
              placeholder="john@email.com"
              type="email"
              className="mt-1 h-9 text-[13px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[12px] font-medium">Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as typeof form.channel }))}>
                <SelectTrigger className="mt-1 h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['whatsapp', 'sms', 'email', 'facebook', 'instagram', 'tiktok'] as const).map(c => (
                    <SelectItem key={c} value={c} className="text-[12px] capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] font-medium">Assign To</Label>
              <Select value={form.assigned_to} onValueChange={v => setForm(f => ({ ...f, assigned_to: v as 'zara' | 'uzair' }))}>
                <SelectTrigger className="mt-1 h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zara" className="text-[12px]">⚡ Zara (AI)</SelectItem>
                  <SelectItem value="uzair" className="text-[12px]">👤 Uzair</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addConversation.isPending}>
              {addConversation.isPending ? 'Adding...' : 'Add Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
