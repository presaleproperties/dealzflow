// MassSendConfirmDialog — pre-flight before mass sends (>1 recipient).
// Shows recipient count, exclusions, throttle estimate, opt-in confirmation,
// and a personalized first preview.

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Send, Users } from 'lucide-react';
import { formatContactName } from '@/lib/format';
import type { CrmContact } from '@/hooks/useCrmContacts';

const THROTTLE_PER_SEC = 5;
const MAX_PER_JOB = 1500;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipients: CrmContact[];
  excluded: CrmContact[];
  subject: string;
  previewHtml: string;
  isPending: boolean;
  onConfirm: () => void | Promise<void>;
}

export function MassSendConfirmDialog({
  open, onOpenChange, recipients, excluded, subject, previewHtml, isPending, onConfirm,
}: Props) {
  const [optedIn, setOptedIn] = useState(false);
  const count = recipients.length;
  const overCap = count > MAX_PER_JOB;
  const estSec = Math.max(1, Math.ceil(count / THROTTLE_PER_SEC));
  const estLabel = estSec < 60 ? `~${estSec}s` : `~${Math.ceil(estSec / 60)}m`;

  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0a;background:#fff}img{max-width:100%;height:auto}</style></head><body>${previewHtml}</body></html>`;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOptedIn(false); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Confirm mass send
          </DialogTitle>
          <DialogDescription>
            Each recipient receives their own personalized email. Variables like <code className="px-1 bg-muted rounded">{'{{lead.first_name}}'}</code> are replaced per row.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Will send to" value={count.toLocaleString()} accent />
            <Stat label="Excluded" value={excluded.length.toLocaleString()} muted />
            <Stat label="Estimated time" value={estLabel} muted />
          </div>

          {/* Subject */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject (preview for first recipient)</p>
            <p className="text-sm font-medium text-foreground truncate mt-0.5">{subject || '(no subject)'}</p>
          </div>

          {/* Preview */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Email preview (first recipient)</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <iframe title="mass-preview" srcDoc={previewDoc} className="w-full bg-white block" style={{ height: 280 }} sandbox="allow-same-origin" />
            </div>
          </div>

          {/* Excluded list */}
          {excluded.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    {excluded.length} lead{excluded.length === 1 ? '' : 's'} will be skipped (no email on file)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {excluded.slice(0, 12).map((r) => (
                      <Badge key={r.id} variant="outline" className="text-[10px] h-5 border-amber-500/40">
                        {formatContactName(r)}
                      </Badge>
                    ))}
                    {excluded.length > 12 && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-300/80 px-1">
                        +{excluded.length - 12} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recipients sample */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              First {Math.min(8, recipients.length)} recipient{recipients.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1">
              {recipients.slice(0, 8).map((r) => (
                <Badge key={r.id} variant="secondary" className="text-[10px] h-5">
                  {formatContactName(r)}
                </Badge>
              ))}
              {recipients.length > 8 && (
                <span className="text-[11px] text-muted-foreground px-1">
                  +{recipients.length - 8} more
                </span>
              )}
            </div>
          </div>

          {/* Opt-in confirmation */}
          {count >= 5 && (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={optedIn}
                onChange={(e) => setOptedIn(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span className="text-xs text-foreground/90 leading-relaxed">
                I confirm these {count.toLocaleString()} recipients have opted in to receive emails from me, and this is not a marketing/bulk campaign that should run through a dedicated marketing service.
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-card shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5 min-w-[160px]"
            onClick={onConfirm}
            disabled={isPending || (count >= 5 && !optedIn) || count === 0}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {isPending ? 'Queueing…' : `Send to ${count.toLocaleString()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${muted ? 'text-foreground/70' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
