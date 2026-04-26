import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft } from 'lucide-react';
import { MonthDayInput, formatMonthDay } from './MonthDayInput';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'date' | 'monthday';
  description?: string;
}

/**
 * iOS-style full-screen drawer for editing a single text/number/textarea field.
 * Used as a mobile replacement for inline pencil edits.
 */
export function MobileTextEditDrawer({
  open,
  onOpenChange,
  title,
  value,
  onSave,
  placeholder,
  type = 'text',
  description,
}: Props) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      // Slight delay so the sheet finishes its transform before we focus.
      const t = window.setTimeout(() => ref.current?.focus(), 220);
      return () => window.clearTimeout(t);
    }
  }, [open, value]);

  const commit = () => {
    onSave(draft.trim());
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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

        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-[env(safe-area-inset-bottom,0px)]">
          {type === 'monthday' ? (
            <>
              <MonthDayInput value={draft} onChange={setDraft} />
              {draft && (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Saved as <span className="text-foreground font-medium">{formatMonthDay(draft) || draft}</span>
                </p>
              )}
            </>
          ) : type === 'textarea' ? (
            <textarea
              ref={(el) => { ref.current = el; }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="w-full min-h-[180px] rounded-lg bg-muted/40 border border-border/40 px-4 py-3 text-[16px] resize-none focus:bg-background focus:border-border focus:outline-none transition-colors"
            />
          ) : (
            <input
              ref={(el) => { ref.current = el; }}
              type={type}
              inputMode={type === 'number' ? 'decimal' : type === 'tel' ? 'tel' : undefined}
              autoCapitalize={type === 'email' ? 'none' : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="w-full h-12 rounded-lg bg-muted/40 border border-border/40 px-4 text-[16px] focus:bg-background focus:border-border focus:outline-none transition-colors"
            />
          )}
          {description && (
            <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
