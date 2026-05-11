import { useState } from 'react';
import { Clock, RotateCcw, Eye, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useTemplateVersions, useRevertTemplateVersion, type TemplateVersion,
} from '@/hooks/useTemplateVersions';
import type { UnifiedTemplate } from '@/hooks/useUnifiedTemplates';

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TemplateVersionHistoryDialog({
  template, open, onOpenChange,
}: {
  template: UnifiedTemplate | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: versions = [], isLoading } = useTemplateVersions(
    template?.id ?? null,
    template?.kind ?? null,
  );
  const revert = useRevertTemplateVersion();
  const [previewing, setPreviewing] = useState<TemplateVersion | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<TemplateVersion | null>(null);

  const editable = template ? template.source !== 'presale' && !template.isLocked : false;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Version history
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {template?.name ?? ''} — {versions.length} saved version{versions.length === 1 ? '' : 's'}.
              {!editable && ' This template is read-only; revert is disabled.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] min-h-[420px] max-h-[70vh]">
            {/* Versions list */}
            <ScrollArea className="border-r border-border/60">
              {isLoading ? (
                <div className="p-6 text-center text-[12px] text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> Loading…
                </div>
              ) : versions.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-muted-foreground">
                  No previous versions yet.<br />
                  Future edits will appear here automatically.
                </div>
              ) : (
                <div className="py-1">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setPreviewing(v)}
                      className={cn(
                        'w-full text-left px-3.5 py-2.5 border-b border-border/40 hover:bg-muted/40 transition-colors',
                        previewing?.id === v.id && 'bg-muted/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-foreground">
                          v{v.version}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {timeAgo(v.created_at)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {v.changed_by_email ?? 'Unknown editor'}
                      </div>
                      {v.name && (
                        <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                          {v.name}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Preview */}
            <div className="flex flex-col min-h-0">
              {previewing ? (
                <>
                  <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                        Version {previewing.version}
                      </div>
                      <div className="text-[13px] font-semibold truncate">
                        {previewing.name ?? template?.name}
                      </div>
                      {previewing.subject && (
                        <div className="text-[11.5px] text-muted-foreground truncate">
                          {previewing.subject}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-[12px] shrink-0"
                      disabled={!editable || revert.isPending}
                      onClick={() => setConfirmRevert(previewing)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Revert to this
                    </Button>
                  </div>
                  <div className="flex-1 bg-muted/20 p-4 overflow-hidden">
                    {template?.kind === 'email' ? (
                      <div className="h-full rounded border border-border/60 bg-white overflow-hidden">
                        <iframe
                          title="Version preview"
                          className="w-full h-full border-0"
                          sandbox="allow-same-origin"
                          srcDoc={`<html><head><style>body{font:14px/1.55 -apple-system,sans-serif;color:#111;padding:20px;margin:0}img{max-width:100%}a{color:#D7A542}</style></head><body>${previewing.body || '<p style="color:#999">Empty</p>'}</body></html>`}
                        />
                      </div>
                    ) : (
                      <pre className="h-full whitespace-pre-wrap text-[13px] p-4 bg-white rounded border border-border/60 overflow-auto">
                        {previewing.body || ''}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 text-[12.5px]">
                  <Eye className="w-5 h-5 opacity-50" />
                  Select a version to preview
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRevert} onOpenChange={(v) => !v && setConfirmRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to v{confirmRevert?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The current content will be saved as a new version first, so nothing is lost.
              You can revert again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmRevert || !template) return;
                revert.mutate(
                  { templateId: template.id, kind: template.kind, version: confirmRevert.version },
                  {
                    onSuccess: () => {
                      setConfirmRevert(null);
                      onOpenChange(false);
                    },
                  },
                );
              }}
            >
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
