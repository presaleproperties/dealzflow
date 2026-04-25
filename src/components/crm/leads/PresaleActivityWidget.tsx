import { format } from "date-fns";
import { Eye, Heart, FileText, Globe, MousePointerClick, Mail, ExternalLink, CheckCircle2, XCircle, Loader2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { usePresaleBehavior } from "@/hooks/usePresaleBehavior";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmAccess } from "@/contexts/CrmAccessContext";
import { toast } from "sonner";

const INITIAL = 12;

type SanityResult = {
  ok: boolean;
  checks?: { views_rendered: boolean; sessions_rendered: boolean; forms_rendered: boolean; links_present: boolean };
  counts?: { views: number; sessions: number; forms: number };
  sample?: { view_url: string | null; session_landing: string | null; form_name: string | null };
  error?: string;
};

export function PresaleActivityWidget({ contactId }: { contactId?: string }) {
  const { data, isLoading } = usePresaleBehavior(contactId);
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [sanityRunning, setSanityRunning] = useState(false);
  const [sanityResult, setSanityResult] = useState<SanityResult | null>(null);

  const runSanityCheck = async () => {
    if (!contactId) return;
    setSanityRunning(true);
    setSanityResult(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("behavior-sanity-check", {
        body: { contact_id: contactId },
      });
      if (error) throw error;
      const result = res as SanityResult;
      setSanityResult(result);
      await queryClient.invalidateQueries({ queryKey: ["presale-behavior", contactId] });
      if (result.ok) {
        toast.success("Web Behavior sanity check passed", {
          description: `Seeded ${result.counts?.views ?? 0} views, ${result.counts?.sessions ?? 0} session, ${result.counts?.forms ?? 0} form. Links present.`,
        });
      } else {
        toast.error("Sanity check found issues", {
          description: JSON.stringify(result.checks ?? result),
        });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setSanityResult({ ok: false, error: msg });
      toast.error("Sanity check failed", { description: msg });
    } finally {
      setSanityRunning(false);
    }
  };

  const clearSanityRows = async () => {
    if (!contactId) return;
    try {
      await supabase.functions.invoke("behavior-sanity-check", {
        body: { contact_id: contactId, cleanup: true },
      });
      await queryClient.invalidateQueries({ queryKey: ["presale-behavior", contactId] });
      setSanityResult(null);
      toast.success("Sanity rows cleared");
    } catch (e: any) {
      toast.error("Cleanup failed", { description: e?.message || String(e) });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  const PRESALE_BASE = "https://presaleproperties.com";
  const toAbs = (u?: string | null): string | null => {
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    return `${PRESALE_BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  };
  const buildSearchUrl = (s: any): string => {
    const params = new URLSearchParams();
    if (s.utm_source) params.set("utm_source", s.utm_source);
    if (s.utm_medium) params.set("utm_medium", s.utm_medium);
    if (s.utm_campaign) params.set("utm_campaign", s.utm_campaign);
    const qs = params.toString();
    return `${PRESALE_BASE}${qs ? `?${qs}` : ""}`;
  };

  type DeepLink = { label: string; href: string };
  type Item = {
    key: string;
    icon: any;
    label: string;
    detail: string;
    primaryUrl?: string | null;     // absolute, for the main click target
    primaryDisplay?: string | null; // what to show for the main link (relative path preferred)
    deepLinks?: DeepLink[];         // additional clickable destinations
    extra?: string | null;
    at: string;
  };

  const items: Item[] = [
    ...((data?.views || []) as any[]).map((v) => {
      const abs = toAbs(v.property_url);
      return {
        key: `v-${v.id}`,
        icon: v.action === "favorite" ? Heart : Eye,
        label: v.action === "favorite" ? "Favorited property" : v.action === "share" ? "Shared property" : "Viewed property",
        detail: v.property_name || v.property_id || "Property",
        primaryUrl: abs,
        primaryDisplay: v.property_url || abs,
        extra: v.duration_seconds ? `${v.duration_seconds}s on page` : null,
        at: v.viewed_at,
      } as Item;
    }),
    ...((data?.forms || []) as any[]).map((f) => {
      const pageUrl = (f.payload && (f.payload.page_url || f.payload.url)) || null;
      const propUrl = f.payload?.property_url || null;
      const primary = toAbs(pageUrl) || toAbs(propUrl);
      const deep: DeepLink[] = [];
      if (propUrl && propUrl !== pageUrl) {
        const a = toAbs(propUrl);
        if (a) deep.push({ label: "Open property", href: a });
      }
      return {
        key: `f-${f.id}`,
        icon: FileText,
        label: (f.form_type || "form").replace(/_/g, " "),
        detail: f.form_name || f.property_name || "Submitted form",
        primaryUrl: primary,
        primaryDisplay: pageUrl || propUrl || primary,
        deepLinks: deep,
        extra: f.funnel_step ? `Step ${f.funnel_step}${f.funnel_total_steps ? `/${f.funnel_total_steps}` : ""}` : null,
        at: f.submitted_at,
      } as Item;
    }),
    ...((data?.engagement || []) as any[]).map((e) => ({
      key: `e-${e.id}`,
      icon: (e.event_type || "").includes("click") ? MousePointerClick : Mail,
      label: (e.event_type || "event").replace(/_/g, " "),
      detail: e.campaign_name || e.template_name || "Email event",
      primaryUrl: toAbs(e.link_url),
      primaryDisplay: e.link_url,
      extra: null,
      at: e.occurred_at,
    } as Item)),
    ...((data?.sessions || []) as any[]).map((s) => {
      const landingAbs = toAbs(s.landing_page);
      const exitAbs = toAbs(s.exit_page);
      const refAbs = s.referrer && /^https?:\/\//i.test(s.referrer) ? s.referrer : null;
      const deep: DeepLink[] = [];
      if (exitAbs && exitAbs !== landingAbs) deep.push({ label: "Exit page", href: exitAbs });
      if (refAbs) deep.push({ label: "Referrer", href: refAbs });
      if (s.utm_source || s.utm_campaign) {
        deep.push({ label: "Campaign URL", href: buildSearchUrl(s) });
      }
      return {
        key: `s-${s.id}`,
        icon: Globe,
        label: "Site visit",
        detail: `${s.pages_viewed || 0} pages · ${s.utm_source || s.referrer || "direct"}`,
        primaryUrl: landingAbs,
        primaryDisplay: s.landing_page || landingAbs,
        deepLinks: deep,
        extra: [
          s.duration_seconds ? `${Math.round(s.duration_seconds / 60)}m` : null,
          s.device_type,
          s.utm_campaign,
        ].filter(Boolean).join(" · ") || null,
        at: s.started_at,
      } as Item;
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const totalCount = items.length;

  const sanityBar = isOwnerOrAdmin && contactId ? (
    <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-2.5 py-1.5 mb-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {sanityResult?.ok ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
        ) : sanityResult && !sanityResult.ok ? (
          <XCircle className="w-3 h-3 text-destructive shrink-0" />
        ) : null}
        <span className="text-[10px] text-muted-foreground truncate">
          {sanityResult?.ok
            ? `Sanity OK · ${sanityResult.counts?.views ?? 0}v / ${sanityResult.counts?.sessions ?? 0}s / ${sanityResult.counts?.forms ?? 0}f · links present`
            : sanityResult?.error
              ? `Sanity error: ${sanityResult.error}`
              : "Web Behavior sanity check (admin)"}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={runSanityCheck}
          disabled={sanityRunning}
          className="text-[10px] px-2 py-0.5 rounded border border-border/60 hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
        >
          {sanityRunning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
          Run check
        </button>
        {sanityResult?.ok ? (
          <button
            onClick={clearSanityRows}
            className="text-[10px] px-2 py-0.5 rounded border border-border/60 hover:bg-muted text-muted-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  if (totalCount === 0) {
    return (
      <div>
        {sanityBar}
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Globe className="w-6 h-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No web behavior received yet</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Will appear here once Presale Properties pushes view, session, form, or engagement events.
          </p>
        </div>
      </div>
    );
  }

  const visible = showAll ? items : items.slice(0, INITIAL);

  return (
    <div className="space-y-1.5">
      {sanityBar}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 mb-1 px-0.5">
        <span>{totalCount} {totalCount === 1 ? "event" : "events"} total</span>
        <span className="tabular-nums">
          {data?.views?.length || 0} views · {data?.sessions?.length || 0} sessions · {data?.forms?.length || 0} forms · {data?.engagement?.length || 0} engagement
        </span>
      </div>

      {visible.map((it) => {
        const Icon = it.icon;
        const primary = it.primaryUrl || null;
        const display = it.primaryDisplay || it.primaryUrl || null;
        return (
          <div key={it.key} className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border/50 hover:border-border transition-colors">
            <div className="w-7 h-7 rounded-md border border-border/60 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-foreground/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground capitalize">{it.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{it.detail}</p>
              {primary && (
                <a
                  href={primary}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 break-all"
                  title={primary}
                >
                  <span className="truncate">{display}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              )}
              {it.deepLinks && it.deepLinks.length > 0 && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                  {it.deepLinks.map((dl, i) => (
                    <a
                      key={i}
                      href={dl.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={dl.href}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      <ChevronRight className="w-2.5 h-2.5" />
                      {dl.label}
                    </a>
                  ))}
                </div>
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
