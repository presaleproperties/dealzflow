import { cn } from '@/lib/utils';

export function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

export function PopoverMenuItem({
  icon, children, onClick, destructive,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs hover:bg-muted text-left',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
