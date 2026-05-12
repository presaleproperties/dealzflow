import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Visual density. `inline` is used inside the inline reply box. */
  variant?: 'banner' | 'inline';
  className?: string;
}

/**
 * Yellow warning shown in compose / reply UIs when the current agent has
 * NOT connected their Gmail. Sending will fail until the agent connects
 * Gmail in Settings → Team — there is no external-provider fallback.
 */
export function FallbackSenderNotice({ variant = 'banner', className }: Props) {
  const message =
    "This agent's Gmail is not connected. Emails cannot be sent until Gmail is connected in Settings > Team.";

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-400/15 border-b border-amber-500/40',
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="truncate">
          Gmail not connected — sends will fail.{' '}
          <Link to="/crm/settings?tab=team" className="underline font-medium">
            Connect
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-400/15 text-amber-900 dark:text-amber-200 px-3 py-2 text-[12px]',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="leading-snug">
        {message}{' '}
        <Link to="/crm/settings?tab=team" className="underline font-medium">
          Open Settings → Team
        </Link>
      </div>
    </div>
  );
}
