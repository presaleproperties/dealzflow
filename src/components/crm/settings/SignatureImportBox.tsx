import { useState } from 'react';
import { Upload, ShieldCheck, AlertTriangle, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { isRichHtml } from '@/lib/htmlDetect';
import {
  sanitizeSignatureHtml,
  signatureImportSchema,
  type SanitizeResult,
} from '@/lib/sanitizeSignature';
import { useUpsertEmailSignature } from '@/hooks/useEmailSignatures';
import LiveSignaturePreview from './LiveSignaturePreview';

/**
 * Paste-and-validate HTML signature importer.
 *
 * Flow:
 * 1. User pastes HTML.
 * 2. We parse/sanitize on the fly with DOMPurify (signature-safe allowlist).
 * 3. Validate name + size with zod.
 * 4. Show what was stripped + a live rendered preview.
 * 5. Save sanitized HTML into the Signature Library.
 */
export default function SignatureImportBox() {
  const upsert = useUpsertEmailSignature();

  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const trimmed = raw.trim();
  const result: SanitizeResult | null = trimmed
    ? sanitizeSignatureHtml(trimmed)
    : null;

  const sizeBytes = new Blob([raw]).size;
  const sizeLabel =
    sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`;

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Prefer rich text/html clipboard payload over plain text fallback,
    // so copying directly from a rendered signature keeps tables/styles.
    const html = e.clipboardData?.getData('text/html');
    if (html && isRichHtml(html)) {
      e.preventDefault();
      setRaw(html);
      setShowPreview(true);
    }
  };

  const handleSave = async () => {
    const parsed = signatureImportSchema.safeParse({ name, html: raw });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    if (!result || !result.html.trim()) {
      toast.error('Nothing to save — sanitization removed all content. Check the HTML.');
      return;
    }

    await upsert.mutateAsync({
      name: parsed.data.name,
      html: result.html,
      is_default: setAsDefault,
    });

    // Reset
    setName('');
    setRaw('');
    setSetAsDefault(false);
  };

  const reset = () => {
    setName('');
    setRaw('');
    setSetAsDefault(false);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Import HTML signature</p>
          <p className="text-[11px] text-muted-foreground">
            Paste any HTML signature. We'll strip unsafe tags (scripts, iframes, event handlers) and save the cleaned version.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Short Reply, Marketing"
            maxLength={80}
            className="h-9"
          />
        </div>
        <div className="space-y-1 flex flex-col">
          <Label className="text-xs">Size</Label>
          <div className="h-9 inline-flex items-center px-2.5 rounded-md border border-border bg-background text-xs text-muted-foreground tabular-nums min-w-[80px] justify-end">
            {sizeLabel}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">HTML</Label>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onPaste={handlePaste}
          placeholder='<table>...</table>'
          spellCheck={false}
          className="min-h-[140px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40"
        />
      </div>

      {/* Validation feedback */}
      {result && (
        <div className="space-y-2">
          {result.warnings.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Clean — nothing was stripped.</span>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Sanitization report
              </div>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-5 list-disc">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>

          {showPreview && result.html && (
            <LiveSignaturePreview html={result.html} withEmailContext={false} />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            className="rounded border-border"
          />
          Set as default signature
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!raw && !name}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={upsert.isPending || !raw.trim() || !name.trim()}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            {upsert.isPending ? 'Saving…' : 'Save signature'}
          </Button>
        </div>
      </div>
    </div>
  );
}
