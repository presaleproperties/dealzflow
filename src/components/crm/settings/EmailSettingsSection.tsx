import { useState, useEffect, useRef } from 'react';
import { Mail, Upload, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useEmailSettings, useUpsertEmailSettings } from '@/hooks/useEmailSettings';
import { useEmailSignatures, useUpsertEmailSignature } from '@/hooks/useEmailSignatures';
import PresaleSignatureBuilder from './PresaleSignatureBuilder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function EmailSettingsSection() {
  const { data: settings, isLoading } = useEmailSettings();
  const upsert = useUpsertEmailSettings();
  const { data: storedSignatures } = useEmailSignatures();
  const upsertSignatureRow = useUpsertEmailSignature();

  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandLogoAlt, setBrandLogoAlt] = useState('');
  const [brandLogoEnabled, setBrandLogoEnabled] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState('');
  const [builderData, setBuilderData] = useState<any>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be smaller than 2 MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${session.user.id}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('brand-logos')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('brand-logos').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      setBrandLogoUrl(url);
      upsert.mutate({ brand_logo_url: url } as any);
      toast.success('Logo uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setBrandLogoUrl('');
    upsert.mutate({ brand_logo_url: null } as any);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: list } = await supabase.storage
          .from('brand-logos')
          .list(session.user.id);
        if (list && list.length > 0) {
          await supabase.storage
            .from('brand-logos')
            .remove(list.map((f) => `${session.user.id}/${f.name}`));
        }
      }
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    if (settings) {
      setSenderName(settings.sender_name || '');
      setReplyTo(settings.reply_to || '');
      setTwilioFrom((settings as any).twilio_from_number || '');
      setBrandLogoUrl((settings as any).brand_logo_url || '');
      setBrandLogoAlt((settings as any).brand_logo_alt || '');
      setBrandLogoEnabled(Boolean((settings as any).brand_logo_enabled));
      setBuilderData((settings as any).signature_builder_data || null);
      setSignatureHtml(settings.signature_html || '');
    }
  }, [settings]);

  // Keep crm_email_signatures default row in sync so all composers see the
  // latest signature (composers read from that table, preferring is_default).
  const syncDefaultSignatureRow = (html: string) => {
    if (!html?.trim()) return;
    const def = (storedSignatures ?? []).find((s) => s.is_default)
      ?? (storedSignatures ?? [])[0];
    upsertSignatureRow.mutate({
      id: def?.id,
      name: def?.name || 'Default signature',
      html,
      is_default: true,
      sort_order: def?.sort_order ?? 0,
    });
  };

  const handleSaveBasics = () => {
    upsert.mutate({
      sender_name: senderName || undefined,
      reply_to: replyTo || undefined,
      twilio_from_number: twilioFrom.trim() || null,
      brand_logo_url: brandLogoUrl.trim() || null,
      brand_logo_alt: brandLogoAlt.trim() || null,
      brand_logo_enabled: brandLogoEnabled,
    } as any);
    toast.success('Saved');
  };

  if (isLoading) return null;

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Mail className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Email & Signature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-3 sm:px-6">
        {/* ───────── 1. Basics ───────── */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sender Name</Label>
            <Input
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
              placeholder="Uzair Muhammad | Presale Properties"
              className="min-h-[44px] sm:min-h-0"
            />
            <p className="text-xs text-muted-foreground">
              Shown in the recipient's inbox as the "From" name.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Reply-To Email</Label>
            <Input
              type="email"
              value={replyTo}
              onChange={e => setReplyTo(e.target.value)}
              placeholder="uzair@presaleproperties.com"
              className="min-h-[44px] sm:min-h-0"
            />
            <p className="text-xs text-muted-foreground">
              Optional — leave blank to use your connected Gmail address.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>SMS Sender Number</Label>
            <Input
              type="tel"
              value={twilioFrom}
              onChange={e => setTwilioFrom(e.target.value)}
              placeholder="+15551234567"
              className="min-h-[44px] sm:min-h-0"
            />
            <p className="text-xs text-muted-foreground">
              E.164 format. Used for outbound SMS from lead pages.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveBasics}
              disabled={upsert.isPending}
              variant="outline"
              size="sm"
            >
              {upsert.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </div>

        {/* ───────── 2. The one signature builder ───────── */}
        <div className="space-y-3 border-t border-border/50 pt-6">
          <PresaleSignatureBuilder
            fallback={{
              fullName: senderName.split('|')[0]?.trim() || senderName,
              email: replyTo || '',
            }}
            initialData={(builderData as any) ?? null}
            onApply={(html, layout, fields, touchedFields) => {
              setSignatureHtml(html);
              const nextBuilder = { fields, touchedFields } as any;
              setBuilderData(nextBuilder);
              upsert.mutate({
                signature_html: html,
                signature_mode: 'html',
                signature_builder_data: nextBuilder,
              } as any);
              syncDefaultSignatureRow(html);
              toast.success(
                `${layout === 'horizontal' ? 'Headshot Left' : 'Headshot Top'} signature applied`,
              );
            }}
          />
        </div>

        {/* ───────── 3. Advanced — brand logo banner ───────── */}
        <div className="border-t border-border/50 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`} />
            Advanced — brand logo banner
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm font-semibold">Brand Logo Banner</Label>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Optional logo prepended to the top of bulk &amp; 1:1 emails. Off by default — most agents prefer the logo to live in the signature only. Recommended: 600px wide max, under 2 MB.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {brandLogoEnabled ? 'On' : 'Off'}
                  </span>
                  <Switch
                    checked={brandLogoEnabled}
                    onCheckedChange={(v) => {
                      setBrandLogoEnabled(v);
                      upsert.mutate({ brand_logo_enabled: v } as any);
                    }}
                    aria-label="Enable email header logo"
                  />
                </div>
              </div>

              {!brandLogoEnabled && (
                <p className="text-[11px] text-muted-foreground italic">
                  Header logo is currently disabled — outgoing emails will have no banner image at the top.
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />

              {brandLogoUrl.trim() ? (
                <>
                  <div className="rounded-md border border-border/60 bg-background p-3 flex items-center justify-center">
                    <img
                      src={brandLogoUrl.trim()}
                      alt={brandLogoAlt.trim() || 'Logo preview'}
                      style={{ maxHeight: 64, maxWidth: '100%' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                        : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Replace logo</>}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full min-h-[44px] sm:min-h-0 border-dashed"
                >
                  {uploadingLogo
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                    : <><Upload className="h-4 w-4 mr-2" /> Upload logo</>}
                </Button>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Alt text (accessibility)</Label>
                <Input
                  value={brandLogoAlt}
                  onChange={e => setBrandLogoAlt(e.target.value)}
                  placeholder="Presale Properties"
                  className="min-h-[44px] sm:min-h-0"
                />
              </div>

              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Use an external URL instead</summary>
                <Input
                  type="url"
                  value={brandLogoUrl}
                  onChange={e => setBrandLogoUrl(e.target.value)}
                  placeholder="https://yourdomain.com/logo.png"
                  className="mt-2 min-h-[44px] sm:min-h-0"
                />
              </details>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
