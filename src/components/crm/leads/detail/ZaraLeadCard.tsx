import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ZaraLeadCard({ contactId }: { contactId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const askZara = async () => {
    const { error } = await supabase.functions.invoke('zara-suggest-reply', {
      body: { contactId, channel: 'whatsapp', inboundText: '(manual draft request)', inboundAt: new Date().toISOString() },
    });
    if (error) toast.error(error.message);
    else toast.success('Draft requested — check the queue');
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Zara</h4>
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
      <Button size="sm" variant="outline" className="w-full" onClick={askZara}>Ask Zara to draft a reply</Button>
    </div>
  );
}
