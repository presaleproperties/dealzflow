import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, X, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oldHtml: string;
  newHtml: string;
  label: string;
  onAccept: () => void;
}

/**
 * Side-by-side diff for AI-rewritten HTML. Renders each side as a
 * sandboxed inline preview rather than a code diff — agents care about
 * how the email reads, not the markup.
 */
export function AIDiffDialog({ open, onOpenChange, oldHtml, newHtml, label, onAccept }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[88vh] p-0 gap-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold truncate">{label}</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Review the change side-by-side. Accept to replace, or close to discard.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onAccept}>
              <Check className="h-3.5 w-3.5" /> Accept change
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 flex-1 overflow-hidden">
          <DiffPane title="Before" html={oldHtml} tone="muted" />
          <DiffPane title="After" html={newHtml} tone="primary" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffPane({ title, html, tone }: { title: string; html: string; tone: 'muted' | 'primary' }) {
  return (
    <div className="flex flex-col rounded-lg border border-border/60 overflow-hidden">
      <div
        className={
          'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b ' +
          (tone === 'primary'
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'bg-muted text-muted-foreground')
        }
      >
        {title}
      </div>
      <iframe
        title={title}
        className="flex-1 w-full bg-white"
        sandbox="allow-same-origin"
        srcDoc={`<html><head><style>body{font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#111;padding:18px;margin:0;background:#fff}img{max-width:100%}</style></head><body>${html || '<p style="color:#999">empty</p>'}</body></html>`}
      />
    </div>
  );
}
