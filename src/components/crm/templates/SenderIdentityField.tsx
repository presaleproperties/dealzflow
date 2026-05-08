import { Lock, User } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { usePresaleAgent } from '@/stores/usePresaleAgent';

/**
 * Read-only sender chip shown in the editor inspector. Per the
 * Sender Signature Rule, the sender is ALWAYS the caller's identity —
 * an admin building a template doesn't get to spoof another agent.
 *
 * The actual sender at send-time is resolved server-side from the caller's
 * crm_team row, so this is purely informational.
 */
export function SenderIdentityField() {
  const { agent } = usePresaleAgent();

  return (
    <div className="space-y-1">
      <Label className="text-xs">Sender identity</Label>
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
        {agent?.headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.headshotUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover ring-1 ring-border/40"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-3 h-3 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-foreground truncate">
            {agent?.name || 'You'}
          </div>
          {agent?.email && (
            <div className="text-[10.5px] text-muted-foreground truncate">{agent.email}</div>
          )}
        </div>
        <Lock className="w-3 h-3 text-muted-foreground/70" aria-label="Locked to your identity" />
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        Test sends and recipient deliveries always use your own signature and inbox.
      </p>
    </div>
  );
}
