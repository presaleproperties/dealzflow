import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ActivityEvent {
  id: string;
  type: string;
  project_slug: string | null;
  agent_slug: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  received_at: string;
}

interface Props {
  contactId: string;
  className?: string;
  /** Maximum number of events to display. */
  limit?: number;
}

const TYPE_LABEL: Record<string, string> = {
  email_open: "Opened email",
  link_click: "Clicked link",
  deck_unlock: "Unlocked pitch deck",
  deck_section_view: "Viewed deck section",
  page_view: "Visited site",
};

const HIGH_INTENT = new Set(["email_open", "deck_unlock", "link_click"]);

/**
 * Live engagement timeline backed by Realtime on `crm_activity_events`.
 * Lights up the moment Presale Properties forwards a new event for this lead.
 */
export function LiveActivityTimeline({ contactId, className, limit = 25 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("crm_activity_events")
        .select("id, type, project_slug, agent_slug, metadata, occurred_at, received_at")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (!cancelled) setEvents((data ?? []) as ActivityEvent[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, limit]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`activity-events-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_activity_events",
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const row = payload.new as ActivityEvent;
          setEvents((prev) => {
            const next = [row, ...(prev ?? [])];
            return next.slice(0, limit);
          });
          setFlashId(row.id);
          window.setTimeout(() => {
            setFlashId((curr) => (curr === row.id ? null : curr));
          }, 1500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, limit]);

  if (events === null) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading live activity…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        No live engagement yet.
      </div>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {events.map((e) => {
        const label = TYPE_LABEL[e.type] ?? e.type.replace(/_/g, " ");
        const isFlashing = flashId === e.id;
        const hot = HIGH_INTENT.has(e.type);
        return (
          <li
            key={e.id}
            className={cn(
              "flex items-start gap-3 rounded-md border bg-card p-2.5 text-sm transition-colors",
              isFlashing && "border-primary bg-primary/5 ring-1 ring-primary/30",
            )}
          >
            <Activity
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                hot ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{label}</span>
                {e.project_slug && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {e.project_slug}
                  </Badge>
                )}
                {isFlashing && (
                  <Badge className="bg-primary text-[10px] text-primary-foreground">
                    LIVE
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
