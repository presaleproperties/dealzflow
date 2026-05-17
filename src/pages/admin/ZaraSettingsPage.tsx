import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Sparkles, ArrowLeft } from 'lucide-react';

type ZaraSettings = {
  id: number;
  enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  daily_send_cap_per_lead: number;
  weekly_send_cap_per_lead: number;
  workspace_daily_cap: number;
  model_classify: string;
  model_draft: string;
  system_prompt_version: string;
  autonomous_outbound: boolean;
  auto_showcase_triggers: string[];
  auto_showcase_count: number;
};

const SHOWCASE_TRIGGER_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'presale_burst', label: 'Presale activity burst', desc: 'Floorplan downloads, deck revisits, repeated opens' },
  { key: 'initial_outreach', label: 'First touch (initial outreach)', desc: 'Zara has never written to this lead before' },
];

export default function ZaraSettingsPage() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ZaraSettings | null>(null);
  const [signatureHtml, setSignatureHtml] = useState('');
  const [zaraId, setZaraId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!checking && !isAdmin) navigate('/');
  }, [checking, isAdmin, navigate]);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('crm_team').select('id, sender_signature_html').eq('slug', 'zara').maybeSingle(),
      ]);
      if (s) setSettings(s as ZaraSettings);
      if (t) {
        setZaraId(t.id);
        setSignatureHtml(t.sender_signature_html || '');
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from('crm_zara_settings')
        .update({
          enabled: settings.enabled,
          quiet_hours_start: settings.quiet_hours_start,
          quiet_hours_end: settings.quiet_hours_end,
          timezone: settings.timezone,
          daily_send_cap_per_lead: settings.daily_send_cap_per_lead,
          weekly_send_cap_per_lead: settings.weekly_send_cap_per_lead,
          workspace_daily_cap: settings.workspace_daily_cap,
          model_classify: settings.model_classify,
          model_draft: settings.model_draft,
          autonomous_outbound: settings.autonomous_outbound,
          auto_showcase_triggers: settings.auto_showcase_triggers ?? [],
          auto_showcase_count: settings.auto_showcase_count ?? 3,
        })
        .eq('id', 1);
      if (e1) throw e1;

      if (zaraId) {
        const { error: e2 } = await supabase
          .from('crm_team')
          .update({ sender_signature_html: signatureHtml })
          .eq('id', zaraId);
        if (e2) throw e2;
      }
      toast.success('Zara settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const syncSignature = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-sync-identity', { body: {} });
      if (error) throw error;
      const { data: t } = await supabase
        .from('crm_team').select('sender_signature_html').eq('slug', 'zara').maybeSingle();
      if (t) setSignatureHtml(t.sender_signature_html || '');
      toast.success('Synced from Presale Properties');
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const update = <K extends keyof ZaraSettings>(k: K, v: ZaraSettings[K]) =>
    setSettings((s) => (s ? { ...s, [k]: v } : s));

  return (
    <AppLayout>
      <Header title="Zara Settings" />
      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Admin
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Zara AI Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Autonomous reply controls for the Zara agent
            </p>
          </div>
        </div>

        {loading || !settings ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kill Switch</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Zara enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    When off, Zara will not auto-reply to anything.
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => update('enabled', v)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quiet Hours</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Start</Label>
                  <Input type="time" value={settings.quiet_hours_start.slice(0, 5)}
                    onChange={(e) => update('quiet_hours_start', e.target.value + ':00')} />
                </div>
                <div>
                  <Label>End</Label>
                  <Input type="time" value={settings.quiet_hours_end.slice(0, 5)}
                    onChange={(e) => update('quiet_hours_end', e.target.value + ':00')} />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input value={settings.timezone}
                    onChange={(e) => update('timezone', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send Caps</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Daily / lead</Label>
                  <Input type="number" min={0} value={settings.daily_send_cap_per_lead}
                    onChange={(e) => update('daily_send_cap_per_lead', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Weekly / lead</Label>
                  <Input type="number" min={0} value={settings.weekly_send_cap_per_lead}
                    onChange={(e) => update('weekly_send_cap_per_lead', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Workspace daily cap</Label>
                  <Input type="number" min={0} value={settings.workspace_daily_cap}
                    onChange={(e) => update('workspace_daily_cap', Number(e.target.value))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Models</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Classifier model</Label>
                  <Input value={settings.model_classify}
                    onChange={(e) => update('model_classify', e.target.value)} />
                </div>
                <div>
                  <Label>Drafter model</Label>
                  <Input value={settings.model_draft}
                    onChange={(e) => update('model_draft', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Sender Signature (HTML)</CardTitle>
                <Button variant="outline" size="sm" onClick={syncSignature} disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Sync from Presale
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={signatureHtml}
                  onChange={(e) => setSignatureHtml(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="<table>...</table>"
                />
                {signatureHtml ? (
                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Preview</div>
                    <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 sticky bottom-4">
              <Button onClick={save} disabled={saving} size="lg">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </>
        )}
      </main>
    </AppLayout>
  );
}
