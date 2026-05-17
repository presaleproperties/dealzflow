import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Mode = 'off' | 'sandbox' | 'live';

export function ZaraModeSection() {
  const [mode, setMode] = useState<Mode>('sandbox');
  const [phones, setPhones] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('zara_settings').select('mode, test_phone_numbers').eq('id', 1).maybeSingle();
      if (data) {
        setMode(data.mode as Mode);
        setPhones((data.test_phone_numbers ?? []).join(', '));
      }
      setLoading(false);
    })();
  }, []);

  const save = async (next: Mode) => {
    const { data: user } = await supabase.auth.getUser();
    const updates: any = {
      mode: next,
      test_phone_numbers: phones.split(',').map((p) => p.trim()).filter(Boolean),
    };
    if (next === 'live') {
      updates.enabled_at = new Date().toISOString();
      updates.enabled_by = user.user?.id;
    }
    const { error } = await supabase.from('zara_settings').update(updates).eq('id', 1);
    if (error) toast.error(error.message);
    else { setMode(next); toast.success(`Zara mode: ${next}`); }
  };

  const handleSelect = (next: Mode) => {
    if (next === 'live') { setConfirmText(''); setConfirmLive(true); }
    else save(next);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 border border-border rounded-lg p-4">
      <div>
        <h3 className="text-base font-semibold">Zara mode</h3>
        <p className="text-xs text-muted-foreground">Controls whether Zara drafts replies and how/when she sends.</p>
      </div>

      <RadioGroup value={mode} onValueChange={(v) => handleSelect(v as Mode)}>
        {([
          ['off', 'Off — no drafts created'],
          ['sandbox', 'Sandbox — drafts created; only sends to zara_test_contact'],
          ['live', 'Live — sends to any zara_enabled contact'],
        ] as const).map(([val, label]) => (
          <div key={val} className="flex items-center space-x-2">
            <RadioGroupItem value={val} id={`zm-${val}`} />
            <Label htmlFor={`zm-${val}`} className="text-sm">{label}</Label>
          </div>
        ))}
      </RadioGroup>

      <div className="space-y-1">
        <Label className="text-xs">Test phone numbers (comma-separated, E.164)</Label>
        <Input value={phones} onChange={(e) => setPhones(e.target.value)} onBlur={() => save(mode)} placeholder="+16041234567, +16049876543" />
        <p className="text-[11px] text-muted-foreground">Used by "Seed test contacts" in the queue. Required for sandbox sends.</p>
      </div>

      <Dialog open={confirmLive} onOpenChange={setConfirmLive}>
        <DialogContent>
          <DialogHeader><DialogTitle>Turn Zara LIVE?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are turning Zara live. She will WhatsApp agents drafts for any lead with zara_enabled=true. Type <strong>GO LIVE</strong> to confirm.
          </p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="GO LIVE" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmLive(false)}>Cancel</Button>
            <Button disabled={confirmText !== 'GO LIVE'} onClick={() => { save('live'); setConfirmLive(false); }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
