import { useState, useEffect } from 'react';
import { Mail, Eye, Code, Type, Paintbrush, Library } from 'lucide-react';
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
import { isRichHtml } from '@/lib/htmlDetect';
import { toast } from 'sonner';

type SignatureMode = 'builder' | 'html' | 'simple';

export default function EmailSettingsSection() {
  const { data: settings, isLoading } = useEmailSettings();
  const upsert = useUpsertEmailSettings();

  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('builder');
  const [signatureHtml, setSignatureHtml] = useState('');
  const [htmlImport, setHtmlImport] = useState('');
  const [simpleHtml, setSimpleHtml] = useState('');
  const [builderData, setBuilderData] = useState<SignatureBuilderData | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  useEffect(() => {
    if (settings) {
      setSenderName(settings.sender_name || '');
      setReplyTo(settings.reply_to || '');
      setTwilioFrom((settings as any).twilio_from_number || '');
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
        <CardTitle className="text-base sm:text-lg">Email Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-3 sm:px-6">
        {/* Sender Name */}
        <div className="space-y-1.5">
          <Label>Sender Name</Label>
          <Input
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder="Uzair Muhammad | Presale Properties"
            className="min-h-[44px] sm:min-h-0"
          />
          <p className="text-xs text-muted-foreground">
            This name appears in the recipient's inbox (e.g. "From: Your Name")
          </p>
        </div>

        {/* Reply-To */}
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
            Optional — if blank, replies go to your connected Gmail address
          </p>
        </div>

        {/* Twilio SMS sender number */}
        <div className="space-y-1.5">
          <Label>SMS Sender Number (Twilio)</Label>
          <Input
            type="tel"
            value={twilioFrom}
            onChange={e => setTwilioFrom(e.target.value)}
            placeholder="+15551234567"
            className="min-h-[44px] sm:min-h-0"
          />
          <p className="text-xs text-muted-foreground">
            E.164 format. Outbound SMS sent from lead pages will use this number.
          </p>
        </div>

        {/* Signature Editor — 3 Modes */}
        <div className="space-y-3">
          <Label>Email Signature</Label>
          <Tabs value={signatureMode} onValueChange={(v) => setSignatureMode(v as SignatureMode)}>
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="builder" className="text-xs gap-1.5">
                <Paintbrush className="h-3.5 w-3.5" /> Builder
              </TabsTrigger>
              <TabsTrigger value="html" className="text-xs gap-1.5">
                <Code className="h-3.5 w-3.5" /> HTML Import
              </TabsTrigger>
              <TabsTrigger value="simple" className="text-xs gap-1.5">
                <Type className="h-3.5 w-3.5" /> Simple Text
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
                Paste your HTML email signature below. It will be appended to every outgoing email exactly as written.
              </p>
              <Textarea
                value={htmlImport}
                onChange={e => setHtmlImport(e.target.value)}
                onPaste={(e) => {
                  // Prefer text/html clipboard payload — keeps tables, styles, MSO intact
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
                {showHtmlPreview ? 'Hide Preview' : 'Preview'}
              </Button>
              {showHtmlPreview && htmlImport && (
                <div className="rounded-lg border border-border/40 bg-white p-4">
                  <div dangerouslySetInnerHTML={{ __html: htmlImport }} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="simple" className="mt-4 space-y-2">
              {/* Capture-phase paste listener: if rich HTML is on the clipboard,
                  re-route to HTML Import tab BEFORE Tiptap can strip it. */}
              <div
                onPasteCapture={(e) => {
                  const html = e.clipboardData?.getData('text/html');
                  if (html && isRichHtml(html)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setHtmlImport(html);
                    setSignatureMode('html');
                    setShowHtmlPreview(true);
                    toast.info('Detected rich HTML signature — switched to HTML Import to preserve formatting');
                  }
                }}
              >
                <RichTextEditor content={simpleHtml} onChange={setSimpleHtml} />
              </div>
            </TabsContent>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            Auto-appended to every outgoing email, separated by a "--" divider
          </p>
        </div>

        {/* Signature Preview (for non-builder modes) */}
        {signatureMode !== 'builder' && getActiveSignatureHtml() && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>Signature Preview</span>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground mb-2">--</div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: getActiveSignatureHtml() }}
              />
            </div>
          </div>
        )}

        {/* Multi-signature library */}
        <div className="space-y-3 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            <Label className="text-sm">Signature Library</Label>
          </div>
          <SignaturesManager />
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={upsert.isPending}
            className="min-h-[44px] sm:min-h-0"
          >
            {upsert.isPending ? 'Saving…' : 'Save Email Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
