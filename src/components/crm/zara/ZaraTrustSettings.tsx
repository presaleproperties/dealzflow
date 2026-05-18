import { useEffect, useState } from 'react';
import { Loader2, Power, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

interface Settings {
  kill_switch: boolean;
  kill_switch_reason: string | null;
  never_quote: { phrases?: string[]; topics?: string[] };
  autonomy_level: number;
}

export function ZaraTrustSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [phrasesText, setPhrasesText] = useState('');
  const [topicsText, setTopicsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [myOverride, setMyOverride] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('zara_settings')
        .select('kill_switch, kill_switch_reason, never_quote, autonomy_level')
        .eq('id', 1)
        .maybeSingle();
      if (data) {
        const nq = (data.never_quote ?? {}) as { phrases?: string[]; topics?: string[] };
        setS({ ...(data as any), never_quote: nq });
        setPhrasesText((nq.phrases ?? []).join('\n'));
        setTopicsText((nq.topics ?? []).join('\n'));
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: t } = await supabase
          .from('crm_team')
          .select('zara_autonomy_override')
          .eq('user_id', user.id)
          .maybeSingle();
        setMyOverride(t?.zara_autonomy_override ?? null);
      }
    })();
  }, []);

  if (!s) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const save = async () => {
    setSaving(true);
    const phrases = phrasesText.split('\n').map((x) => x.trim()).filter(Boolean);
    const topics = topicsText.split('\n').map((x) => x.trim()).filter(Boolean);
    const { error } = await supabase
      .from('zara_settings')
      .update({
        kill_switch: s.kill_switch,
        kill_switch_reason: s.kill_switch_reason,
        never_quote: { phrases, topics },
        autonomy_level: s.autonomy_level,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) toast.error('Save failed: ' + error.message);
    else toast.success('Zara trust settings saved');
  };

  const saveOverride = async (val: number | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('crm_team').update({ zara_autonomy_override: val }).eq('user_id', user.id);
    setMyOverride(val);
    toast.success(val == null ? 'Using team autonomy default' : `Your autonomy override: ${val}`);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Kill switch */}
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Power className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold">Team-wide kill switch</h3>
        </div>
        <p className="text-[12px] text-muted-foreground">Instantly pause every Zara draft, send, and outbound action across the team. Inbound messages still arrive; nothing is sent without a human.</p>
        <div className="flex items-center justify-between">
          <Label htmlFor="kill" className="text-sm">Pause Zara now</Label>
          <Switch id="kill" checked={s.kill_switch} onCheckedChange={(v) => setS({ ...s, kill_switch: v })} />
        </div>
        {s.kill_switch && (
          <Input
            placeholder="Reason (visible to team in banner)"
            value={s.kill_switch_reason ?? ''}
            onChange={(e) => setS({ ...s, kill_switch_reason: e.target.value })}
          />
        )}
      </section>

      {/* Autonomy */}
      <section className="rounded-xl border border-border/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Autonomy</h3>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Team default: {s.autonomy_level}</Label>
          <Slider min={1} max={5} step={1} value={[s.autonomy_level]} onValueChange={(v) => setS({ ...s, autonomy_level: v[0] })} />
          <p className="text-[11px] text-muted-foreground">1 = drafts only · 3 = drafts + suggest send · 5 = auto-send on high confidence + topic allow-list</p>
        </div>
        <div className="border-t border-border/40 pt-3 space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">My personal override</Label>
          <div className="flex items-center gap-2">
            <Slider
              min={1}
              max={5}
              step={1}
              value={[myOverride ?? s.autonomy_level]}
              onValueChange={(v) => saveOverride(v[0])}
              className="flex-1"
            />
            <Button variant="ghost" size="sm" onClick={() => saveOverride(null)} disabled={myOverride == null}>Use team default</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Override your own autonomy without changing the team setting.</p>
        </div>
      </section>

      {/* Never quote */}
      <section className="rounded-xl border border-border/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Never-quote rules</h3>
        <p className="text-[12px] text-muted-foreground">Zara will refuse to draft these and escalate to you. Server-side enforced.</p>
        <div className="space-y-1">
          <Label className="text-xs">Phrases (one per line)</Label>
          <Textarea rows={3} value={phrasesText} onChange={(e) => setPhrasesText(e.target.value)} placeholder="guaranteed return&#10;risk-free&#10;exclusive deal" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Topics (one per line)</Label>
          <Textarea rows={3} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder="mortgage rates&#10;immigration&#10;legal advice" />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save trust settings</Button>
      </div>
    </div>
  );
}
