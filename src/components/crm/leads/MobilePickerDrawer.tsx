import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, Check } from 'lucide-react';

interface MobilePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (value: string) => void;
}

/**
 * iOS-style full-screen picker drawer.
 * Mirrors native iOS list pickers: back arrow + title + Done,
 * full-width rows with a checkmark on the selected item.
 */
export function MobilePickerDrawer({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChange,
}: MobilePickerDrawerProps) {
  const [pending, setPending] = useState<string | undefined>(value);
  // Snapshot of the value when the drawer opened — used to pin the
  // initially-selected row to the top so user can see what's already chosen.
  const [initialValue, setInitialValue] = useState<string | undefined>(value);

  // Sync pending → current value whenever the drawer opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPending(value);
      setInitialValue(value);
    }
    onOpenChange(next);
  };

  const ordered = useMemo(() => {
    if (!initialValue) return options;
    const top = options.filter((o) => o.value === initialValue);
    const rest = options.filter((o) => o.value !== initialValue);
    return [...top, ...rest];
  }, [options, initialValue]);

  const commit = () => {
    if (pending && pending !== value) onChange(pending);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 border-l border-border/60 bg-background native-safe-top"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-2 h-[52px] border-b border-border/40 bg-background/80 backdrop-blur-xl shrink-0 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-10 w-10 -ml-1 rounded-full active:bg-muted/60 transition-all active:scale-90"
            aria-label="Back"
          >
            <ChevronLeft className="w-[22px] h-[22px] text-foreground" strokeWidth={2.4} />
          </button>
          <h2 className="text-[16px] font-semibold text-foreground tracking-[-0.01em]">{title}</h2>
          <button
            type="button"
            onClick={commit}
            className="px-3 h-9 mr-1 text-[15px] font-semibold text-primary active:opacity-60 transition-opacity"
          >
            Done
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
          {ordered.map((opt) => {
            const selected = pending === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPending(opt.value)}
                className="w-full flex items-center justify-between px-5 h-14 text-left border-b border-border/30 active:bg-muted/40 transition-colors"
              >
                <span className="text-[16px] text-foreground">{opt.label}</span>
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
                    selected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-transparent'
                  }`}
                >
                  {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface MobilePickerFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  onClick: () => void;
}

/**
 * Tappable row that opens a MobilePickerDrawer.
 * Use as a Select replacement inside AddLeadDialog FieldRow.
 */
export function MobilePickerField({ value, placeholder, onClick }: MobilePickerFieldProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between h-10 px-3 text-[14px] bg-background/60 border border-border/60 rounded-lg active:bg-muted/40 transition-colors"
    >
      <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
        {value || placeholder || 'Select'}
      </span>
      <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" strokeWidth={2.2} />
    </button>
  );
}
