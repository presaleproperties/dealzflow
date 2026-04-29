import { useTeamAgents, type TeamAgent } from '@/hooks/useTeamAgents';
import { cn } from '@/lib/utils';

/**
 * Tiny circular headshot used inside Select dropdowns and chips.
 * Falls back to initials when no headshot is available.
 */
export function AgentAvatar({
  name,
  headshotUrl,
  focalY,
  size = 18,
  className,
}: {
  name: string;
  headshotUrl?: string | null;
  focalY?: number | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (headshotUrl) {
    return (
      <img
        src={headshotUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={cn('block rounded-full object-cover shrink-0 align-middle ring-1 ring-border/60', className)}
        style={{
          width: size,
          height: size,
          objectPosition: `center ${focalY ?? 30}%`,
        }}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-muted text-[9px] font-semibold leading-none text-muted-foreground shrink-0 align-middle ring-1 ring-border/60',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials || '?'}
    </span>
  );
}

/** Lookup-by-name helper for sites that only store the agent's display name. */
export function useAgentLookup() {
  const { data } = useTeamAgents();
  const byName = new Map<string, TeamAgent>();
  (data ?? []).forEach((a) => byName.set(a.name, a));
  return byName;
}
