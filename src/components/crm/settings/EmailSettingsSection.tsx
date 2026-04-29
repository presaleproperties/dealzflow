import { useState, useEffect, useRef } from 'react';
import { Mail, Eye, Code, Type, Paintbrush, Library, Upload, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { useEmailSettings, useUpsertEmailSettings } from '@/hooks/useEmailSettings';
import SignatureBuilder, { type SignatureBuilderData } from './SignatureBuilder';
import SignaturesManager from './SignaturesManager';
import SignatureImportBox from './SignatureImportBox';
import LiveSignaturePreview from './LiveSignaturePreview';
import PresalePresetCard from './PresalePresetCard';
import { isRichHtml } from '@/lib/htmlDetect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PresaleSignaturePresetId } from '@/lib/presaleSignatures';

type SignatureMode = 'builder' | 'html' | 'simple';

export default function EmailSettingsSection() {
  const { data: settings, isLoading } = useEmailSettings();
  const upsert = useUpsertEmailSettings();

  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandLogoAlt, setBrandLogoAlt] = useState('');
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('builder');
  const [signatureHtml, setSignatureHtml] = useState('');
  const [htmlImport, setHtmlImport] = useState('');
  const [simpleHtml, setSimpleHtml] = useState('');
  const [builderData, setBuilderData] = useState<SignatureBuilderData | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = useState(true);
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
      const mode = ((settings as any).signature_mode as SignatureMode) || 'builder';
      setSignatureMode(mode);
      setBuilderData((settings as any).signature_builder_data || null);
      if (mode === 'html') {
        setHtmlImport(settings.signature_html || '');
      } else if (mode === 'simple') {
        setSimpleHtml(settings.signature_html || '');
      }
      setSignatureHtml(settings.signature_html || '');
    }
  }, [settings]);

  const handleBuilderChange = (html: string, data: SignatureBuilderData) => {
    setSignatureHtml(html);
    setBuilderData(data);
  };

  const getActiveSignatureHtml = (): string => {
    if (signatureMode === 'builder') return signatureHtml;
    if (signatureMode === 'html') return htmlImport;
    return simpleHtml;
  };

  const handleSave = () => {
    upsert.mutate({
      sender_name: senderName || undefined,
      reply_to: replyTo || undefined,
      twilio_from_number: twilioFrom.trim() || null,
      brand_logo_url: brandLogoUrl.trim() || null,
      brand_logo_alt: brandLogoAlt.trim() || null,
      signature_html: getActiveSignatureHtml() || undefined,
      signature_mode: signatureMode,
      signature_builder_data: signatureMode === 'builder' ? builderData : undefined,
    } as any);
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
        </div>

        {/* ───────── 2. Signature (Presale presets — primary) ───────── */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Email Signature</Label>
          <p className="text-xs text-muted-foreground">
            Pick one of the Presale Properties signatures below. It's auto-appended to every email you send.
          </p>
          <PresalePresetCard
            fallbackAgent={{
              full_name: senderName.split('|')[0]?.trim() || senderName,
              email: replyTo || null,
            }}
            onApply={(preset: PresaleSignaturePresetId, html) => {
              setSignatureMode('html');
              setHtmlImport(html);
              setSignatureHtml(html);
              setShowHtmlPreview(true);
              upsert.mutate({
                signature_html: html,
                signature_mode: 'html',
                signature_builder_data: null,
              } as any);
              const labelByPreset: Record<string, string> = {
                presale_headshot_left: 'Headshot Left signature applied',
                presale_card: 'Presale Card signature applied',
                presale_lofty: 'Lofty / plain signature applied',
              };
              toast.success(labelByPreset[preset] ?? 'Signature applied');
            }}
          />
        </div>

        {/* Active signature preview (always visible if one is set) */}
        {getActiveSignatureHtml() && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>Current signature preview</span>
            </div>
            <LiveSignaturePreview html={getActiveSignatureHtml()} withEmailContext />
          </div>
        )}

        {/* ───────── 3. Advanced (collapsed) ───────── */}
        <div className="border-t border-border/50 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`} />
            Advanced — brand logo, custom HTML, signature builder
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-6">
              {/* Brand Logo */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
                <div>
                  <Label className="text-sm font-semibold">Brand Logo Banner</Label>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Added to the top of bulk &amp; 1:1 emails. Recommended: 600px wide max, under 2 MB.
                  </p>
                </div>

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

              {/* Custom signature editor */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Custom Signature Editor</Label>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    For one-offs that aren't a Presale preset. Choosing one here overrides the preset above.
                  </p>
                </div>
                <Tabs value={signatureMode} onValueChange={(v) => setSignatureMode(v as SignatureMode)}>
                  <TabsList className="grid w-full grid-cols-3 h-9">
                    <TabsTrigger value="builder" className="text-xs gap-1.5">
                      <Paintbrush className="h-3.5 w-3.5" /> Builder
                    </TabsTrigger>
                    <TabsTrigger value="html" className="text-xs gap-1.5">
                      <Code className="h-3.5 w-3.5" /> HTML
                    </TabsTrigger>
                    <TabsTrigger value="simple" className="text-xs gap-1.5">
                      <Type className="h-3.5 w-3.5" /> Simple
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="builder" className="mt-4">
                    <SignatureBuilder
                      initialData={builderData}
                      senderName={senderName}
                      onChange={handleBuilderChange}
                    />
                  </TabsContent>

                  <TabsContent value="html" className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Paste HTML — appended verbatim to every email.
                    </p>
                    <Textarea
                      value={htmlImport}
                      onChange={e => setHtmlImport(e.target.value)}
                      onPaste={(e) => {
                        const html = e.clipboardData?.getData('text/html');
                        if (html && isRichHtml(html)) {
                          e.preventDefault();
                          setHtmlImport(html);
                          setShowHtmlPreview(true);
                        }
                      }}
                      placeholder="<table>...</table>"
                      className="min-h-[200px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      {showHtmlPreview ? 'Hide preview' : 'Show preview'}
                    </Button>
                    {showHtmlPreview && <LiveSignaturePreview html={htmlImport} />}
                  </TabsContent>

                  <TabsContent value="simple" className="mt-4 space-y-2">
                    <div
                      onPasteCapture={(e) => {
                        const html = e.clipboardData?.getData('text/html');
                        if (html && isRichHtml(html)) {
                          e.preventDefault();
                          e.stopPropagation();
                          setHtmlImport(html);
                          setSignatureMode('html');
                          setShowHtmlPreview(true);
                          toast.info('Detected rich HTML — switched to HTML to preserve formatting');
                        }
                      }}
                    >
                      <RichTextEditor content={simpleHtml} onChange={setSimpleHtml} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Signature library */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Signature Library</Label>
                </div>
                <SignatureImportBox />
                <SignaturesManager />
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={upsert.isPending}
            className="min-h-[44px] sm:min-h-0"
          >
            {upsert.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
