import { useTeamByUserId, initialsFromName } from '@/hooks/useTeamByUserId';
import { cn } from '@/lib/utils';

interface AgentBadgeProps {
  userId?: string | null;
  /** When true, also render the agent's first name beside the avatar. */
  showName?: boolean;
  /** Optional label override, e.g. "by", "from". */
  prefix?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Compact attribution chip showing which CRM agent performed an action
 * (sent the email, wrote the note, logged the call, etc.).
 *
 * Renders the agent's headshot when available, otherwise their initials in
 * a deterministic muted circle. Falls back to "System" when no user_id is
 * provided (e.g. automated activity, web-form inquiries).
 */
export function AgentBadge({
  userId,
  showName = true,
  prefix,
  size = 'xs',
  className,
}: AgentBadgeProps) {
  const { data: teamMap } = useTeamByUserId();
  const member = userId ? teamMap?.[userId] : null;

  const name = member?.display_name ?? (userId ? 'Agent' : 'System');
  const firstName = name.split(/\s+/)[0];
  const initials = initialsFromName(name);

  const dim = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-4 h-4 text-[9px]';
  const focalY = member?.focal_y ?? 50;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] text-muted-foreground normal-case tracking-normal',
        className,
      )}
      title={`${prefix ? prefix + ' ' : ''}${name}`}
    >
      {prefix && <span className="opacity-70">{prefix}</span>}
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full overflow-hidden bg-muted text-foreground/80 font-semibold border border-border/60 shrink-0',
          dim,
        )}
      >
        {member?.headshot_url ? (
          <img
            src={member.headshot_url}
            alt={name}
            className="w-full h-full object-cover"
            style={{ objectPosition: `center ${focalY}%` }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </span>
      {showName && (
        <span className="text-foreground/75 font-medium truncate max-w-[80px]">
          {firstName}
        </span>
      )}
    </span>
  );
}
