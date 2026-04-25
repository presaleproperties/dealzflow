import { useEffect, useState } from "react";
import { useBehaviorOverview } from "@/hooks/useBehaviorOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Eye, Users, Repeat, ExternalLink, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const WINDOW_OPTIONS = [
  { label: "24h", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

export default function CrmBehaviorDashboardPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useBehaviorOverview(days);
  const queryClient = useQueryClient();

  // Realtime: refresh overview when any behavior table changes
  useEffect(() => {
    const channel = supabase
      .channel("behavior-overview")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_lead_behavior_views" }, () =>
        queryClient.invalidateQueries({ queryKey: ["behavior-overview"] })
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_lead_behavior_sessions" }, () =>
        queryClient.invalidateQueries({ queryKey: ["behavior-overview"] })
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_lead_behavior_forms" }, () =>
        queryClient.invalidateQueries({ queryKey: ["behavior-overview"] })
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_lead_behavior_engagement" }, () =>
        queryClient.invalidateQueries({ queryKey: ["behavior-overview"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const funnel = data?.signup_funnel ?? { started: 0, in_progress: 0, completed: 0, abandoned: 0 };
  const funnelTotal = funnel.started + funnel.in_progress + funnel.completed + funnel.abandoned;
  const conversionRate = funnelTotal > 0 ? Math.round((funnel.completed / funnelTotal) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Web Behavior</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live activity from Presale Properties · updates in real time
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                days === o.value ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={Activity}
          label="Active now"
          value={data?.active_sessions_30m ?? 0}
          sublabel="sessions in last 30m"
          loading={isLoading}
          live
        />
        <Kpi
          icon={Eye}
          label="Total events"
          value={data?.total_events ?? 0}
          sublabel={`last ${days}d`}
          loading={isLoading}
        />
        <Kpi
          icon={Repeat}
          label="Return visitors"
          value={data?.return_visits ?? 0}
          sublabel="2+ sessions"
          loading={isLoading}
        />
        <Kpi
          icon={TrendingUp}
          label="Signup conversion"
          value={`${conversionRate}%`}
          sublabel={`${funnel.completed} / ${funnelTotal} forms`}
          loading={isLoading}
        />
      </div>

      {/* Signup funnel */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Signup funnel
        </h2>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FunnelStep label="Started" value={funnel.started} color="hsl(var(--muted-foreground))" />
            <FunnelStep label="In progress" value={funnel.in_progress} color="hsl(var(--primary) / 0.6)" />
            <FunnelStep label="Completed" value={funnel.completed} color="hsl(var(--primary))" highlight />
            <FunnelStep label="Abandoned" value={funnel.abandoned} color="hsl(var(--destructive) / 0.7)" />
          </div>
        )}
      </section>

      {/* Top properties */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" /> Top viewed properties
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data?.top_properties?.length ? (
          <div className="divide-y divide-border/60">
            {data.top_properties.map((p, i) => (
              <div key={`${p.property_name}-${i}`} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums w-6">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.property_name}</p>
                    {p.property_url && (
                      <a
                        href={p.property_url.startsWith("http") ? p.property_url : `https://presaleproperties.com${p.property_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                      >
                        {p.property_url}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                  <span><strong className="text-foreground">{p.views}</strong> <span className="text-muted-foreground">views</span></span>
                  <span><strong className="text-foreground">{p.unique_leads}</strong> <span className="text-muted-foreground">leads</span></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No property views in this window yet.</p>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sublabel, loading, live,
}: {
  icon: any; label: string; value: number | string; sublabel?: string; loading?: boolean; live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-label="live" />}
        </div>
      )}
      {sublabel && <p className="text-[11px] text-muted-foreground mt-1">{sublabel}</p>}
    </div>
  );
}

function FunnelStep({ label, value, color, highlight }: { label: string; value: number; color: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
