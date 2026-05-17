import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Settings = {
  use_scaffold: boolean;
  append_signature: boolean;
  fallback_template_id: string | null;
};

export function ZaraEmailBehaviorSection() {
  const [s, setS] = useState<Settings>({ use_scaffold: true, append_signature: true, fallback_template_id: null });
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: cfg }, { data: tpls }] = await Promise.all([
        supabase.from('zara_settings').select('email_use_template_scaffold, email_append_signature, email_fallback_template_id').eq('id', 1).maybeSingle(),
        supabase.from('crm_email_templates').select('id, name').eq('is_active', true).order('name'),
      ]);
      const c = (cfg as any) ?? {};
      setS({
        use_scaffold: c.email_use_template_scaffold !== false,
        append_signature: c.email_append_signature !== false,
        fallback_template_id: c.email_fallback_template_id ?? null,
      });
      setTemplates((tpls ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    const { error } = await supabase.from('zara_settings').upsert({
      id: 1,
      email_use_template_scaffold: next.use_scaffold,
      email_append_signature: next.append_signature,
      email_fallback_template_id: next.fallback_template_id,
    } as any, { onConflict: 'id' });
    if (error) toast.error(error.message);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Zara email behavior</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Controls how Zara renders draft emails before they hit the queue.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <Label className="text-sm font-medium">Always use a template scaffold</Label>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            Wrap every Zara email draft in your branded HTML scaffold (navy header, CTA button, dark footer). Turn off only for plain-text drafts.
          </p>
        </div>
        <Switch checked={s.use_scaffold} onCheckedChange={(v) => save({ use_scaffold: v })} />
      </div>

      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <Label className="text-sm font-medium">Append my signature to Zara drafts</Label>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            Zara appends your default signature (from the Signatures Manager) to every email draft.
          </p>
        </div>
        <Switch checked={s.append_signature} onCheckedChange={(v) => save({ append_signature: v })} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Fallback template</Label>
        <p className="text-xs text-muted-foreground">
          Used when no template matches the draft intent.
        </p>
        <Select
          value={s.fallback_template_id ?? 'none'}
          onValueChange={(v) => save({ fallback_template_id: v === 'none' ? null : v })}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Inline navy scaffold" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Inline navy scaffold (built-in)</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
