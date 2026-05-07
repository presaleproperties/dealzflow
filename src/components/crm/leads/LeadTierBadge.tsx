// Shared lead tier badge — single source of truth for score → tier → color.
// Tiers come from `lead_tier` (server-computed). If absent, derive from score.
import { cn } from "@/lib/utils";

export type LeadTier = "hot" | "warm" | "lukewarm" | "cold" | "dead";

export function tierFromScore(score?: number | null): LeadTier {
  const s = score ?? 0;
  if (s >= 70) return "hot";
  if (s >= 40) return "warm";
  if (s >= 15) return "lukewarm";
  if (s > 0) return "cold";
  return "dead";
}

export function resolveTier(opts: { tier?: string | null; score?: number | null }): LeadTier {
  const t = (opts.tier ?? "").toLowerCase();
  if (["hot", "warm", "lukewarm", "cold", "dead"].includes(t)) return t as LeadTier;
  return tierFromScore(opts.score);
}

const TIER_META: Record<LeadTier, { label: string; cls: string; dot: string }> = {
  hot:      { label: "Hot",      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500" },
  warm:     { label: "Warm",     cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",       dot: "bg-amber-500" },
  lukewarm: { label: "Lukewarm", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30",   dot: "bg-orange-500" },
  cold:     { label: "Cold",     cls: "bg-slate-500/10 text-slate-500 border-slate-500/30",      dot: "bg-slate-400" },
  dead:     { label: "Dead",     cls: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",         dot: "bg-zinc-400" },
};

export function LeadTierBadge({
  tier,
  score,
  showScore = true,
  className,
}: {
  tier?: string | null;
  score?: number | null;
  showScore?: boolean;
  className?: string;
}) {
  const t = resolveTier({ tier, score });
  const meta = TIER_META[t];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        meta.cls,
        className,
      )}
      title={`${meta.label}${typeof score === "number" ? ` · score ${score}` : ""}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      <span>{meta.label}</span>
      {showScore && typeof score === "number" && (
        <span className="opacity-60">· {score}</span>
      )}
    </span>
  );
}
