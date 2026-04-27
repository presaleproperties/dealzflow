import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  bridgeClient,
  projectThumbnail,
  type BridgeProjectSummary,
  type BridgeProjectFull,
} from "@/lib/presaleBridgeClient";

interface PresaleProjectPickerProps {
  /** Currently selected slug (controlled). */
  value?: string;
  /** Fired when a project is selected; receives the full payload from `bridge-get-project`. */
  onSelect: (project: BridgeProjectFull) => void;
  /** Optional: initial label to show when value is set but no full payload is loaded. */
  initialLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 250;

/**
 * Async combobox backed by the live Presale Properties bridge.
 * Drop-in for any place a user picks a project (composer, lead notes,
 * marketing tools, etc.).
 */
export function PresaleProjectPicker({
  value,
  onSelect,
  initialLabel,
  placeholder = "Search Presale projects…",
  className,
  disabled,
}: PresaleProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<BridgeProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(initialLabel);
  const reqId = useRef(0);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch results
  useEffect(() => {
    if (!open) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    bridgeClient
      .searchProjects(debounced)
      .then((rows) => {
        if (reqId.current !== myReq) return;
        setResults(rows.slice(0, 25));
      })
      .catch((e: Error) => {
        if (reqId.current !== myReq) return;
        setError(e.message);
        setResults([]);
      })
      .finally(() => {
        if (reqId.current === myReq) setLoading(false);
      });
  }, [debounced, open]);

  const handlePick = async (p: BridgeProjectSummary) => {
    setResolving(true);
    setError(null);
    try {
      const full = await bridgeClient.getProject(p.slug);
      const merged = { ...p, ...full } as BridgeProjectFull;
      setSelectedLabel(merged.name ?? p.slug);
      onSelect(merged);
      setOpen(false);
      setQuery("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const buttonLabel = useMemo(() => {
    if (resolving) return "Loading project…";
    return selectedLabel ?? value ?? placeholder;
  }, [selectedLabel, value, placeholder, resolving]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled || resolving}
          className={cn(
            "w-full justify-between font-normal h-10 text-sm",
            !value && !selectedLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">{buttonLabel}</span>
          {resolving ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,90vw)] p-0"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by project, neighborhood, developer…"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
          />
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <ScrollArea className="max-h-80">
          {error && (
            <div className="px-3 py-3 text-xs text-destructive">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {debounced ? "No projects found" : "Start typing to search…"}
            </div>
          )}
          {results.map((p) => {
            const thumb = projectThumbnail(p);
            const selected = value === p.slug;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => handlePick(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                <div className="h-10 w-14 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {p.name ?? p.slug}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[p.neighborhood, p.city, p.developer]
                      .filter(Boolean)
                      .join(" · ") || p.slug}
                  </div>
                </div>
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selected ? "opacity-100 text-primary" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
