import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Reply, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useEmailSignatures,
  useUpsertEmailSignature,
} from '@/hooks/useEmailSignatures';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { buildPresaleReplySignature } from '@/lib/presaleSignatures';

/**
 * Per-agent minimalist REPLY signature.
 * ────────────────────────────────────────────────────────────────────────
 * Auto-seeded from the agent's Presale identity (name, title, brokerage,
 * phone, email). Auto-appended on every reply / forward across the CRM
 * (inline reply box, ComposeEmailDialog reply prefill, lead detail "Reply").
 *
 * Why a separate signature: full signatures look heavy when stacked at the
 * bottom of every message in a thread. Mail clients (Gmail, Apple Mail,
 * Outlook) trim them by default. A 3-line signature reads native inside
 * threaded conversations.
 */
export function ReplySignatureCard() {
  const { data: signatures = [] } = useEmailSignatures();
  const upsert = useUpsertEmailSignature();
  const { agent } = usePresaleAgent();
  const { settings } = useEmailSettings();

  const replyRow = useMemo(
    () => signatures.find((s) => s.kind === 'reply') ?? null,
    [signatures],
  );

  const [html, setHtml] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (replyRow && !editing) setHtml(replyRow.html ?? '');
  }, [replyRow, editing]);

  // Source the reply signature info from the SAME data that powers the
  // signature builder above (crm_email_settings.signature_builder_data.fields).
  // Falls back to the Presale agent identity so brand-new agents still get
  // a sensible default before they've touched the builder.
  const derivedDefault = useMemo(() => {
    const fields =
      ((settings as any)?.signature_builder_data?.fields ?? {}) as Record<string, string | undefined>;
    return buildPresaleReplySignature({
      full_name: fields.fullName || agent?.name,
      title: fields.title || agent?.title,
      phone: fields.phone || agent?.phone,
      email: fields.email || agent?.email,
      brokerage: fields.brokerage || agent?.brokerage,
      license_no: agent?.licenseNumber,
      calendly_url: agent?.calendlyUrl,
      website_url: fields.website || agent?.websiteUrl,
      instagram_url: fields.instagram || agent?.instagramUrl,
    });
  }, [settings, agent]);

  const previewHtml = (editing ? html : replyRow?.html) || derivedDefault;

  const handleSave = () => {
    upsert.mutate(
      {
        id: replyRow?.id,
        name: replyRow?.name || 'Reply signature',
        html: html.trim(),
        is_default: true,
        sort_order: replyRow?.sort_order ?? 0,
        kind: 'reply',
      },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Reply signature saved');
        },
      },
    );
  };

  const handleResetToDefault = () => {
    setHtml(derivedDefault);
    setEditing(true);
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Reply className="h-5 w-5 text-primary" />
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base sm:text-lg">Reply signature</CardTitle>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Minimalist 3-line signature auto-appended on every reply &amp; forward.
            Keeps threaded conversations clean — your full branded signature
            still goes out on new emails.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <div
          className="rounded-lg border border-border bg-background px-4 py-3"
          aria-label="Reply signature preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />

        {editing ? (
          <>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={8}
              className="font-mono text-[12px]"
              placeholder="HTML for your reply signature…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={upsert.isPending || !html.trim()}
              >
                {upsert.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHtml(replyRow?.html ?? '');
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetToDefault}
                className="ml-auto text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset to Presale default
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Customize
            </Button>
            {!replyRow && (
              <span className="text-[11px] text-muted-foreground">
                Auto-derived from your Presale identity. Save to lock it in.
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReplySignatureCard;
