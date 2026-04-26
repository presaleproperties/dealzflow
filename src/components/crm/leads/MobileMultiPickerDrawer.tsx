import { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, Check, Plus, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: Option[];
  /** Current selection (uncontrolled internally — synced on open). */
  value: string[];
  onChange: (next: string[]) => void;
  /** When provided, allows the user to add a new value via the input below. */
  onCreate?: (label: string) => void;
  placeholder?: string;
}

/**
 * iOS-style full-screen multi-select drawer.
 * Renders a search input, the list of options with counts on the right,
 * and a checkmark for each selected row. "Done" commits the selection.
 */
export function MobileMultiPickerDrawer({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChange,
  onCreate,
  placeholder,
}: Props) {
  const [pending, setPending] = useState<string[]>(value);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setPending(value);
      setSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const exactMatch = useMemo(
    () => options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase()),
    [options, search],
  );

  const toggle = (val: string) => {
    setPending((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  };

  const commit = () => {
    onChange(pending);
    onOpenChange(false);
  };

  const handleCreate = () => {
    const name = search.trim();
    if (!name || !onCreate) return;
    onCreate(name);
    setPending((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setSearch('');
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

        {/* Search */}
        <div className="px-4 pt-3 pb-2 border-b border-border/30 bg-background sticky top-[52px] z-[9]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={2} />
            <input
              autoFocus={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder || `Search ${title.toLowerCase()}…`}
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-muted/60 border border-transparent text-[15px] focus:bg-background focus:border-border focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
          {filtered.map((opt) => {
            const selected = pending.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center justify-between px-5 h-14 text-left border-b border-border/30 active:bg-muted/40 transition-colors"
              >
                <span className="text-[16px] text-foreground truncate flex-1">{opt.label}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {opt.count != null && opt.count > 0 && (
                    <span className="text-[12px] tabular-nums text-muted-foreground">{opt.count}</span>
                  )}
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
                      selected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-transparent'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Empty / create */}
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-[14px] text-muted-foreground">
              {search ? `No matches for "${search}"` : 'No options available'}
            </div>
          )}

          {onCreate && search.trim() && !exactMatch && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full flex items-center gap-3 px-5 h-14 text-left border-b border-border/30 active:bg-muted/40 transition-colors"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
              </span>
              <span className="text-[15px] text-foreground">
                Add <span className="font-semibold">"{search.trim()}"</span>
              </span>
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
