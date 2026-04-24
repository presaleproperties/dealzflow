import { format } from "date-fns";
import { Eye, Heart, FileText, Globe, MousePointerClick, Mail, ExternalLink } from "lucide-react";
import { useState } from "react";
import { usePresaleBehavior } from "@/hooks/usePresaleBehavior";
import { Skeleton } from "@/components/ui/skeleton";

const INITIAL = 12;

export function PresaleActivityWidget({ contactId }: { contactId?: string }) {
  const { data, isLoading } = usePresaleBehavior(contactId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  type Item = {
    key: string;
    icon: any;
    label: string;
    detail: string;
    url?: string | null;
    extra?: string | null;
    at: string;
  };

  const items: Item[] = [
    ...((data?.views || []) as any[]).map((v) => ({
      key: `v-${v.id}`,
      icon: v.action === "favorite" ? Heart : Eye,
      label: v.action === "favorite" ? "Favorited property" : v.action === "share" ? "Shared property" : "Viewed property",
      detail: v.property_name || v.property_id || "Property",
      url: v.property_url,
      extra: v.duration_seconds ? `${v.duration_seconds}s on page` : null,
      at: v.viewed_at,
    })),
    ...((data?.forms || []) as any[]).map((f) => ({
      key: `f-${f.id}`,
      icon: FileText,
      label: (f.form_type || "form").replace(/_/g, " "),
      detail: f.form_name || f.property_name || "Submitted form",
      url: (f.payload && (f.payload.page_url || f.payload.url)) || null,
      extra: f.funnel_step ? `Step ${f.funnel_step}${f.funnel_total_steps ? `/${f.funnel_total_steps}` : ""}` : null,
      at: f.submitted_at,
    })),
    ...((data?.engagement || []) as any[]).map((e) => ({
      key: `e-${e.id}`,
      icon: (e.event_type || "").includes("click") ? MousePointerClick : Mail,
      label: (e.event_type || "event").replace(/_/g, " "),
      detail: e.campaign_name || e.template_name || "Email event",
      url: e.link_url,
      extra: null,
      at: e.occurred_at,
    })),
    ...((data?.sessions || []) as any[]).map((s) => ({
      key: `s-${s.id}`,
      icon: Globe,
      label: "Site visit",
      detail: `${s.pages_viewed || 0} pages · ${s.utm_source || s.referrer || "direct"}`,
      url: s.landing_page,
      extra: [
        s.duration_seconds ? `${Math.round(s.duration_seconds / 60)}m` : null,
        s.device_type,
        s.utm_campaign,
      ].filter(Boolean).join(" · ") || null,
      at: s.started_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const totalCount = items.length;

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Globe className="w-6 h-6 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No web behavior received yet</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          Will appear here once Presale Properties pushes view, session, form, or engagement events.
        </p>
      </div>
    );
  }

  const visible = showAll ? items : items.slice(0, INITIAL);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 mb-1 px-0.5">
        <span>{totalCount} {totalCount === 1 ? "event" : "events"} total</span>
        <span className="tabular-nums">
          {data?.views?.length || 0} views · {data?.sessions?.length || 0} sessions · {data?.forms?.length || 0} forms · {data?.engagement?.length || 0} engagement
        </span>
      </div>

      {visible.map((it) => {
        const Icon = it.icon;
        const absoluteUrl = it.url
          ? (/^https?:\/\//i.test(it.url) ? it.url : `https://presaleproperties.com${it.url.startsWith("/") ? "" : "/"}${it.url}`)
          : null;
        return (
          <div key={it.key} className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border/50 hover:border-border transition-colors">
            <div className="w-7 h-7 rounded-md border border-border/60 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-foreground/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground capitalize">{it.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{it.detail}</p>
              {absoluteUrl && (
                <a
                  href={absoluteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 break-all"
                >
                  <span className="truncate">{it.url}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              )}
              {it.extra && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{it.extra}</p>}
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                {format(new Date(it.at), "MMM d · h:mm a")}
              </p>
            </div>
          </div>
        );
      })}

      {totalCount > INITIAL && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="w-full text-[11px] text-muted-foreground hover:text-foreground py-2 mt-1"
        >
          {showAll ? "Show less" : `Show all ${totalCount} events`}
        </button>
      )}
    </div>
  );
}
