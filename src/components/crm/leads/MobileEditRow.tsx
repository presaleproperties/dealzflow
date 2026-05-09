import { ChevronRight, Plus } from 'lucide-react';

interface Props {
  label: string;
  value?: React.ReactNode;
  placeholder?: string;
  onClick: () => void;
}

/**
 * Tappable row used on mobile lead-detail screens.
 * Empty state renders as a dashed "+ Add" pill so it's instantly
 * obvious which fields are unset and tappable.
 */
export function MobileEditRow({ label, value, placeholder = 'Add', onClick }: Props) {
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-3 py-3 border-b border-border/60 last:border-b-0 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
    >
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/90 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        {empty ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground/80 px-2 py-0.5 rounded-full border border-dashed border-border/80">
            <Plus className="w-3 h-3" strokeWidth={2.4} />
            {placeholder}
          </span>
        ) : (
          <>
            <div className="text-[13.5px] truncate min-w-0 text-foreground font-medium">
              {value}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" strokeWidth={2.2} />
          </>
        )}
      </div>
    </button>
  );
}
