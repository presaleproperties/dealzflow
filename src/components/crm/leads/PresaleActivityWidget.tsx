import { format } from "date-fns";
import { Eye, Heart, FileText, Globe, MousePointerClick, Mail } from "lucide-react";
import { usePresaleBehavior } from "@/hooks/usePresaleBehavior";
import { Skeleton } from "@/components/ui/skeleton";

export function PresaleActivityWidget({ contactId }: { contactId?: string }) {
  const { data, isLoading } = usePresaleBehavior(contactId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  const items = [
    ...(data?.views || []).map((v: any) => ({
      key: `v-${v.id}`,
      icon: v.action === "favorite" ? Heart : Eye,
      label: v.action === "favorite" ? "Favorited" : "Viewed",
      detail: v.property_name || v.property_id || "Property",
      at: v.viewed_at,
    })),
    ...(data?.forms || []).map((f: any) => ({
      key: `f-${f.id}`,
      icon: FileText,
      label: f.form_type.replace(/_/g, " "),
      detail: f.form_name || f.property_name || "Submitted form",
      at: f.submitted_at,
    })),
    ...(data?.engagement || []).map((e: any) => ({
      key: `e-${e.id}`,
      icon: e.event_type.includes("click") ? MousePointerClick : Mail,
      label: e.event_type.replace(/_/g, " "),
      detail: e.campaign_name || e.link_url || "Email event",
      at: e.occurred_at,
    })),
    ...(data?.sessions || []).map((s: any) => ({
      key: `s-${s.id}`,
      icon: Globe,
      label: "Site visit",
      detail: `${s.pages_viewed || 0} pages · ${s.utm_source || s.referrer || "direct"}`,
      at: s.started_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Globe className="w-6 h-6 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No Presale activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.key} className="flex items-start gap-2.5 p-2.5 rounded-md bg-card border border-border/50 hover:border-border transition-colors">
            <div className="w-7 h-7 rounded-md border border-border/60 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-foreground/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate capitalize">{it.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{it.detail}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{format(new Date(it.at), "MMM d · h:mm a")}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
