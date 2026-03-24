import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAddConversation } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageSquare, Zap, Phone } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_OPENER =
  "Hi {{name}}! 👋 I'm Zara, Uzair's AI assistant. I saw you were interested in real estate in Metro Vancouver — I'd love to help! Are you looking to buy, sell, or just exploring your options?";

export function AddLeadModal({ open, onOpenChange }: Props) {
  const addConversation = useAddConversation();

  type FormState = {
    lead_name: string;
    lead_phone: string;
    lead_email: string;
    channel: 'whatsapp' | 'sms' | 'email' | 'facebook' | 'instagram' | 'tiktok';
    status: 'new';
    assigned_to: 'zara' | 'uzair';
    heat: number;
  };

  const [form, setForm] = useState<FormState>({
    lead_name: '',
    lead_phone: '',
    lead_email: '',
    channel: 'whatsapp',
    status: 'new',
    assigned_to: 'zara',
    heat: 50,
  });

  const [kickoffZara, setKickoffZara] = useState(true);
  const [customOpener, setCustomOpener] = useState('');
  const [showCustomOpener, setShowCustomOpener] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const canSendViaWhatsApp =
    (form.channel === 'whatsapp' || form.channel === 'sms') && !!form.lead_phone.trim();

  const resolvedOpener = (customOpener.trim() || DEFAULT_OPENER).replace(
    /\{\{name\}\}/g,
    form.lead_name.split(' ')[0] || 'there'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_name.trim()) return;

    setIsSending(true);
    try {
      // 1. Create the conversation
      const conversation = await addConversation.mutateAsync({
        ...form,
        lead_id: null,
        external_id: null,
        last_message_at: null,
        meta_window_expires_at: null,
        lofty_contact_id: null,
        avatar_url: null,
      });

      // 2. Optionally kick off Zara's first message via Twilio
      if (kickoffZara && canSendViaWhatsApp && conversation?.id) {
        try {
          // Insert a synthetic inbound "seed" message so Zara has context
          await supabase.from('messages').insert({
            conversation_id: conversation.id,
            direction: 'inbound',
            sender: 'lead',
            body: `[Manual lead added] ${form.lead_name} — ${form.channel} — please send the opening qualification message.`,
            status: 'delivered',
            metadata: { source: 'manual_add', is_synthetic: true },
          });

          // Call zara-respond which will use Twilio to send the opener
          const { error: fnError } = await supabase.functions.invoke('zara-respond', {
            body: {
              conversationId: conversation.id,
              overrideFirstMessage: resolvedOpener,
            },
          });

          if (fnError) {
            console.error('zara-respond error:', fnError);
            toast.warning('Lead added — but failed to send opening WhatsApp. Check Twilio config.');
          } else {
            toast.success(`Lead added & Zara sent the opening WhatsApp to ${form.lead_phone} 🚀`);
          }
        } catch (err) {
          console.error('Zara kickoff error:', err);
          toast.warning('Lead added — Zara kickoff failed. Send manually from the conversation.');
        }
      }

      // Reset & close
      onOpenChange(false);
      setForm({
        lead_name: '',
        lead_phone: '',
        lead_email: '',
        channel: 'whatsapp',
        status: 'new',
        assigned_to: 'zara',
        heat: 50,
      });
      setCustomOpener('');
      setShowCustomOpener(false);
      setKickoffZara(true);
    } catch {
      // addConversation already toasts on error
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">Add New Lead</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          {/* Name */}
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

          {/* Phone */}
          <div>
            <Label className="text-[12px] font-medium flex items-center gap-1">
              <Phone className="h-3 w-3" />
              Phone
              {kickoffZara && (form.channel === 'whatsapp' || form.channel === 'sms') && (
                <span className="text-[10px] text-muted-foreground font-normal ml-1">— required to send via Twilio</span>
              )}
            </Label>
            <Input
              value={form.lead_phone}
              onChange={e => setForm(f => ({ ...f, lead_phone: e.target.value }))}
              placeholder="+1 604 123 4567"
              className="mt-1 h-9 text-[13px]"
            />
          </div>

          {/* Email */}
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

          {/* Channel + Assign */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[12px] font-medium">Channel</Label>
              <Select
                value={form.channel}
                onValueChange={v => setForm(f => ({ ...f, channel: v as typeof form.channel }))}
              >
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
              <Select
                value={form.assigned_to}
                onValueChange={v => setForm(f => ({ ...f, assigned_to: v as 'zara' | 'uzair' }))}
              >
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

          {/* ── Zara Kickoff Section ── */}
          {(form.channel === 'whatsapp' || form.channel === 'sms') && form.assigned_to === 'zara' && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-2.5">
              {/* Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[12px] font-semibold text-foreground">
                    Send opening {form.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} via Zara
                  </span>
                </div>
                <Switch
                  checked={kickoffZara}
                  onCheckedChange={setKickoffZara}
                />
              </div>

              {kickoffZara && (
                <>
                  {/* Phone warning */}
                  {!form.lead_phone.trim() && (
                    <p className="text-[11px] text-destructive/80">
                      ⚠ Add a phone number above to enable sending
                    </p>
                  )}

                  {/* Preview / custom opener */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Opening message
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCustomOpener(v => !v)}
                        className="text-[10px] text-primary hover:underline"
                      >
                        {showCustomOpener ? 'Use default' : 'Customise'}
                      </button>
                    </div>

                    {showCustomOpener ? (
                      <Textarea
                        value={customOpener}
                        onChange={e => setCustomOpener(e.target.value)}
                        placeholder={DEFAULT_OPENER}
                        className="text-[12px] min-h-[72px] resize-none"
                        rows={3}
                      />
                    ) : (
                      <div className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-[12px] text-muted-foreground leading-relaxed">
                        {resolvedOpener}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSending || addConversation.isPending}
            >
              {isSending
                ? kickoffZara && canSendViaWhatsApp
                  ? 'Sending...'
                  : 'Adding...'
                : kickoffZara && canSendViaWhatsApp
                ? '⚡ Add & Send'
                : 'Add Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
