import { ChevronRight } from 'lucide-react';

interface Props {
  label: string;
  value?: React.ReactNode;
  placeholder?: string;
  onClick: () => void;
}

/**
 * Tappable row used on mobile lead-detail screens.
 * Replaces the desktop pencil-edit affordance with a chevron right arrow,
 * making it visually clear that tapping opens a drawer.
 */
export function MobileEditRow({ label, value, placeholder = 'Add', onClick }: Props) {
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-2.5 border-b border-border/40 active:bg-muted/40 transition-colors text-left"
    >
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        <div className={`text-[13px] truncate min-w-0 ${empty ? 'text-muted-foreground/60' : 'text-foreground font-medium'}`}>
          {empty ? placeholder : value}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" strokeWidth={2.2} />
      </div>
    </button>
  );
}
