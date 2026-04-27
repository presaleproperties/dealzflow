import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import {
  Eye,
  FileText,
  Globe,
  Mail,
  MousePointerClick,
  Lock,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  bridgeClient,
  type BridgeBehavior,
  type BridgeBehaviorEvent,
} from "@/lib/presaleBridgeClient";

interface PresaleLeadBehaviorTimelineProps {
  lead: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  };
  className?: string;
  /** Show a compact variant (used in narrow side panels). */
  compact?: boolean;
}

interface NormalizedEvent {
  id: string;
  rawType: string;
  category: "view" | "deck" | "deck-section" | "email-open" | "email-click" | "form" | "session" | "other";
  label: string;
  detail?: string;
  url?: string;
  projectName?: string;
  durationSeconds?: number;
  at: Date;
}

const CATEGORY_META: Record<NormalizedEvent["category"], { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  view: { icon: Eye, tone: "text-foreground", label: "Page view" },
  deck: { icon: Lock, tone: "text-primary", label: "Pitch deck unlock" },
  "deck-section": { icon: FileText, tone: "text-foreground", label: "Deck section" },
  "email-open": { icon: Mail, tone: "text-foreground", label: "Email open" },
  "email-click": { icon: MousePointerClick, tone: "text-foreground", label: "Email click" },
  form: { icon: FileText, tone: "text-foreground", label: "Form submission" },
  session: { icon: Globe, tone: "text-foreground", label: "Site visit" },
  other: { icon: Clock, tone: "text-muted-foreground", label: "Activity" },
};

function pickDate(e: BridgeBehaviorEvent): Date | null {
  const candidates = [
    e.occurred_at,
    e.timestamp,
    (e as any).viewed_at,
    (e as any).submitted_at,
    (e as any).started_at,
    (e as any).created_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function categorize(rawType: string): NormalizedEvent["category"] {
  const t = rawType.toLowerCase();
  if (t.includes("deck_section") || t.includes("deck-section") || t.includes("section_dwell")) return "deck-section";
  if (t.includes("deck") || t.includes("pitch") || t.includes("unlock")) return "deck";
  if (t.includes("email") && (t.includes("click") || t.includes("link"))) return "email-click";
  if (t.includes("email") && t.includes("open")) return "email-open";
  if (t.includes("form") || t.includes("submit")) return "form";
  if (t.includes("session") || t.includes("visit")) return "session";
  if (t.includes("view") || t.includes("page")) return "view";
  return "other";
}

function normalize(behavior: BridgeBehavior | undefined): NormalizedEvent[] {
  if (!behavior) return [];
  const buckets: { events: BridgeBehaviorEvent[]; defaultType: string }[] = [
    { events: behavior.views ?? [], defaultType: "view" },
    { events: behavior.sessions ?? [], defaultType: "session" },
    { events: behavior.forms ?? [], defaultType: "form" },
    { events: behavior.engagement ?? [], defaultType: "engagement" },
    { events: behavior.email_events ?? [], defaultType: "email" },
    { events: behavior.events ?? [], defaultType: "event" },
  ];

  const out: NormalizedEvent[] = [];
  let i = 0;
  for (const bucket of buckets) {
    for (const e of bucket.events) {
      const at = pickDate(e);
      if (!at) continue;
      const rawType = String(
        e.type ?? e.event ?? (e as any).action ?? (e as any).event_type ?? bucket.defaultType,
      );
      const category = categorize(rawType);
      const meta = CATEGORY_META[category];
      const projectName =
        (e.project_name as string) ??
        (e.property_name as string) ??
        ((e as any).project?.name as string) ??
        undefined;
      const url = (e.url as string) ?? (e.page_url as string) ?? (e.property_url as string) ?? undefined;
      const detailParts: string[] = [];
      if (projectName) detailParts.push(projectName);
      if ((e as any).section) detailParts.push(String((e as any).section));
      if (rawType && rawType !== bucket.defaultType) detailParts.push(rawType.replace(/_/g, " "));
      out.push({
        id: String(e.id ?? `${bucket.defaultType}-${i++}-${at.getTime()}`),
        rawType,
        category,
        label: meta.label,
        detail: detailParts.join(" · ") || undefined,
        url,
        projectName,
        durationSeconds:
          typeof e.duration_seconds === "number" ? e.duration_seconds : undefined,
        at,
      });
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

export function PresaleLeadBehaviorTimeline({
  lead,
  className,
  compact = false,
}: PresaleLeadBehaviorTimelineProps) {
  const email = lead.email?.trim().toLowerCase() || undefined;
  const phone = lead.phone?.trim() || undefined;
  const enabled = !!(email || phone);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["presale-bridge-behavior", email ?? "", phone ?? ""],
    queryFn: () => bridgeClient.getLeadBehavior({ email, phone }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const events = useMemo(() => normalize(data), [data]);

  const isLive = useMemo(() => {
    if (!events.length) return false;
    return Date.now() - events[0].at.getTime() < 5 * 60 * 1000;
  }, [events]);

  const grouped = useMemo(() => {
    const map = new Map<string, NormalizedEvent[]>();
    for (const ev of events) {
      const key = format(ev.at, "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: dayLabel(items[0].at),
      items,
    }));
  }, [events]);

  if (!enabled) {
    return (
      <div className={cn("text-xs text-muted-foreground py-4", className)}>
        Add an email or phone to fetch tracked activity.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("text-xs text-destructive py-3", className)}>
        Failed to load: {(error as Error)?.message ?? "unknown error"}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
        <Globe className="h-6 w-6 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No tracked activity yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Page views, deck unlocks, and email events will show up here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {isLive && (
            <Badge variant="secondary" className="gap-1.5 px-2 py-0 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </Badge>
          )}
        </div>
      </div>

      {grouped.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {group.label}
          </div>
          <ol className="space-y-1.5">
            {group.items.map((ev) => {
              const meta = CATEGORY_META[ev.category];
              const Icon = meta.icon;
              return (
                <li
                  key={ev.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border border-border bg-card p-2.5",
                    compact && "p-2",
                  )}
                >
                  <div className="h-8 w-8 rounded-md border border-border flex items-center justify-center shrink-0">
                    <Icon className={cn("h-4 w-4", meta.tone)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-foreground capitalize truncate">
                        {meta.label}
                      </p>
                      <time className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {format(ev.at, "h:mm a")}
                      </time>
                    </div>
                    {ev.detail && (
                      <p className="text-xs text-muted-foreground truncate">{ev.detail}</p>
                    )}
                    {typeof ev.durationSeconds === "number" && ev.durationSeconds > 0 && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {ev.durationSeconds}s on page
                      </p>
                    )}
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline max-w-full"
                        title={ev.url}
                      >
                        <span className="truncate">{ev.url}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
