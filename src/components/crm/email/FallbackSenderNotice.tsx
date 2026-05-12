import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Visual density. `inline` is used inside the inline reply box. */
  variant?: 'banner' | 'inline';
  className?: string;
}

/**
 * Shown in compose / reply UIs when the current agent has not connected
 * their Gmail. Outbound mail will be sent via the Resend fallback from
 * `noreply@dealzflow.ca` with `reply_to` set to the agent's address, so
 * replies still route back correctly — but the sender shown to the
 * recipient won't be the agent's personal inbox.
 */
export function FallbackSenderNotice({ variant = 'banner', className }: Props) {
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border-b border-amber-500/30',
          className,
        )}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="truncate">
          Sending from <strong>noreply@dealzflow.ca</strong> — Gmail not connected.{' '}
          <Link to="/crm/settings" className="underline font-medium">
            Connect
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2 text-[12px]',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="leading-snug">
        Your Gmail isn’t connected. This message will be sent from{' '}
        <strong>noreply@dealzflow.ca</strong> via the fallback sender — replies will
        still reach your inbox.{' '}
        <Link to="/crm/settings" className="underline font-medium">
          Connect Gmail
        </Link>{' '}
        to send as yourself.
      </div>
    </div>
  );
}
