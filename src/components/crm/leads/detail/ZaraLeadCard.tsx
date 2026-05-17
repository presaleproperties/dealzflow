import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, MessageSquare, Mail, MessageCircle, Trophy } from 'lucide-react';
import { useZaraDock } from '@/stores/useZaraDock';
import { TrainOnWinDialog } from './TrainOnWinDialog';

type Channel = 'sms' | 'email' | 'whatsapp';

export function ZaraLeadCard({ contactId, contactName }: { contactId: string; contactName?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drafting, setDrafting] = useState<Channel | null>(null);
  const [showTrain, setShowTrain] = useState(false);
  const { setOpen: setDockOpen } = useZaraDock();

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from('crm_contacts').select('zara_enabled').eq('id', contactId).maybeSingle(),
        supabase.from('zara_lead_memory').select('summary').eq('contact_id', contactId).maybeSingle(),
      ]);
      if (c) setEnabled(!!c.zara_enabled);
      if (m) setMemory(m.summary);
    })();
  }, [contactId]);

  const toggle = async (next: boolean) => {
    const { data: user } = await supabase.auth.getUser();
    const prev = enabled;
    setEnabled(next);
    const { error } = await supabase.from('crm_contacts').update({
      zara_enabled: next,
      zara_enabled_at: next ? new Date().toISOString() : null,
      zara_enabled_by: next ? user.user?.id : null,
    }).eq('id', contactId);
    if (error) { setEnabled(prev); toast.error(error.message); return; }
    await supabase.from('crm_engagement_events').insert({
      contact_id: contactId,
      event_type: next ? 'zara_enabled' : 'zara_disabled',
      source: 'crm',
      actor_id: user.user?.id ?? null,
      metadata: { toggled_by: user.user?.id, prev_state: prev },
    } as any);
    toast.success(next ? 'Zara enabled for this lead' : 'Zara disabled');
  };

  const refresh = async () => {
    setRefreshing(true);
    const { error } = await supabase.functions.invoke('zara-refresh-memory', { body: { contact_id: contactId } });
    setRefreshing(false);
    if (error) { toast.error(error.message); return; }
    const { data: m } = await supabase.from('zara_lead_memory').select('summary').eq('contact_id', contactId).maybeSingle();
    setMemory(m?.summary ?? null);
    toast.success('Memory refreshed');
  };

  const draftWithZara = async (channel: Channel) => {
    setDrafting(channel);
    try {
      const { error } = await supabase.functions.invoke('zara-suggest-reply', {
        body: { contactId, channel, inboundText: '(manual draft request)', inboundAt: new Date().toISOString() },
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`Zara is drafting ${channel.toUpperCase()} — opening dock`, {
        description: 'Review and approve in the Zara queue or dock.',
      });
      // Pop the floating dock so the user can watch / approve immediately.
      setDockOpen(true);
    } finally {
      setDrafting(null);
    }
  };

  const channels: Array<{ key: Channel; label: string; icon: typeof MessageSquare }> = [
    { key: 'sms', label: 'SMS', icon: MessageSquare },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  ];

  return (
    <>
      <div className="border border-border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-sm font-semibold">Zara</h4>
          </div>
          <Button size="sm" variant="ghost" disabled={refreshing} onClick={refresh}>{refreshing ? '…' : 'Refresh memory'}</Button>
        </div>

        <div className="text-[12px] text-muted-foreground whitespace-pre-wrap min-h-[40px]">
          {memory ?? '(no memory yet — click Refresh)'}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="zara-toggle" className="text-[12px]">Let Zara draft replies for this lead</Label>
          <Switch id="zara-toggle" checked={enabled} onCheckedChange={toggle} />
        </div>
        <p className="text-[10.5px] text-muted-foreground">Off by default. Turn on only after you've talked to this lead and trust Zara to match the tone.</p>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Draft with Zara</div>
          <div className="grid grid-cols-3 gap-1.5">
            {channels.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                size="sm"
                variant="outline"
                disabled={drafting !== null}
                onClick={() => draftWithZara(key)}
                className="h-9 px-2 text-[11.5px] gap-1"
              >
                <Icon className="w-3 h-3" />
                {drafting === key ? '…' : label}
              </Button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowTrain(true)}
          className="w-full h-9 text-[12px] gap-1.5 border border-dashed border-border hover:border-primary/40 hover:bg-primary/5"
        >
          <Trophy className="w-3.5 h-3.5 text-primary" />
          Train Zara on this win
        </Button>
      </div>

      <TrainOnWinDialog
        contactId={contactId}
        contactName={contactName ?? 'this lead'}
        open={showTrain}
        onOpenChange={setShowTrain}
      />
    </>
  );
}
