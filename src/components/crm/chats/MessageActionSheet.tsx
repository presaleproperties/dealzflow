/**
 * MessageActionSheet — bottom sheet shown when a chat bubble is long-pressed.
 *
 * Replaces desktop hover affordances on touch devices. Always renders Copy
 * and Quote-reply; renders Resend only for failed outbound bubbles; renders
 * Delete only for outbound bubbles the user owns.
 */
import { Copy, CornerUpLeft, RotateCcw, Trash2 } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export interface MessageActionTarget {
  id: string;
  text: string;
  outbound: boolean;
  failed?: boolean;
  canDelete?: boolean;
}

interface Props {
  target: MessageActionTarget | null;
  onClose: () => void;
  onCopy: (t: MessageActionTarget) => void;
  onQuoteReply: (t: MessageActionTarget) => void;
  onResend?: (t: MessageActionTarget) => void;
  onDelete?: (t: MessageActionTarget) => void;
}

export function MessageActionSheet({ target, onClose, onCopy, onQuoteReply, onResend, onDelete }: Props) {
  const open = !!target;
  const handle = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[60dvh] rounded-t-3xl border-t border-border/60 p-0 pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        {target && (
          <div className="px-3 pt-3">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/25 mb-3" />
            <div className="rounded-2xl bg-muted/40 px-3 py-2 mb-3 text-[13px] text-foreground/90 line-clamp-3 whitespace-pre-wrap">
              {target.text || <span className="italic opacity-60">(empty)</span>}
            </div>
            <div className="flex flex-col">
              <SheetItem icon={<CornerUpLeft className="w-4 h-4" />} label="Reply with quote" onClick={handle(() => onQuoteReply(target))} />
              <SheetItem icon={<Copy className="w-4 h-4" />} label="Copy text" onClick={handle(() => onCopy(target))} />
              {target.failed && onResend && (
                <SheetItem icon={<RotateCcw className="w-4 h-4" />} label="Resend message" onClick={handle(() => onResend(target))} />
              )}
              {target.canDelete && onDelete && (
                <SheetItem icon={<Trash2 className="w-4 h-4" />} label="Delete" destructive onClick={handle(() => onDelete(target))} />
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full h-11 rounded-xl bg-muted/60 text-[14px] font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetItem({ icon, label, onClick, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-[15px] font-medium active:bg-muted/60 transition-colors ${destructive ? 'text-destructive' : 'text-foreground'}`}
    >
      <span className={`w-8 h-8 rounded-full flex items-center justify-center ${destructive ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}
