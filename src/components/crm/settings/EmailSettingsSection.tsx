import { useState, useEffect } from 'react';
import { Mail, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { useEmailSettings, useUpsertEmailSettings } from '@/hooks/useEmailSettings';

export default function EmailSettingsSection() {
  const { data: settings, isLoading } = useEmailSettings();
  const upsert = useUpsertEmailSettings();

  const [senderName, setSenderName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [signatureHtml, setSignatureHtml] = useState('');

  useEffect(() => {
    if (settings) {
      setSenderName(settings.sender_name || '');
      setReplyTo(settings.reply_to || '');
      setSignatureHtml(settings.signature_html || '');
    }
  }, [settings]);

  const handleSave = () => {
    upsert.mutate({
      sender_name: senderName || undefined,
      reply_to: replyTo || undefined,
      signature_html: signatureHtml || undefined,
    });
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

        {/* Signature Editor */}
        <div className="space-y-1.5">
          <Label>Email Signature</Label>
          <RichTextEditor content={signatureHtml} onChange={setSignatureHtml} />
          <p className="text-xs text-muted-foreground">
            Auto-appended to every outgoing email, separated by a "--" divider
          </p>
        </div>

        {/* Signature Preview */}
        {signatureHtml && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>Signature Preview</span>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground mb-2">--</div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
            </div>
          </div>
        )}

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
