// zara-learned-brief — assembles a compact "what we've learned" block that
// gets injected into Zara's system prompt every turn.
//
// It reads the top-weighted rows from the existing learning tables:
//   - zara_tone_preferences      (dimension → rule)
//   - zara_style_memory          (category  → observation)
//   - zara_cta_preferences       (verdict + cta_text)
//   - zara_rewrite_patterns      (before → after, optional context)
//   - zara_approval_decisions    (used to extract timing patterns per channel)
//
// The block is kept short on purpose — we want the model to internalize a few
// strong signals, not be drowned in low-evidence noise. All thresholds are
// conservative; tables that don't yet have enough data simply contribute
// nothing for that section.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type SB = ReturnType<typeof createClient>;

const MAX_TONE = 5;
const MAX_STYLE = 5;
const MAX_REWRITE = 6;
const MAX_CTA = 4;
const MIN_EVIDENCE = 2;        // only surface rules seen ≥2 times
const RECENT_DAYS = 60;         // for timing patterns

function bucketHour(h: number): string {
  if (h < 5) return "late night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "late night";
}

export async function buildLearnedPreferencesBlock(sb: SB): Promise<string> {
  // Run the table reads in parallel — each one is small (LIMIT 20-ish).
  const [tonesQ, styleQ, ctaQ, rewriteQ, timingQ] = await Promise.all([
    sb.from("zara_tone_preferences")
      .select("dimension,rule,evidence_count,weight,last_seen_at")
      .gte("evidence_count", MIN_EVIDENCE)
      .order("weight", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(20),
    sb.from("zara_style_memory")
      .select("category,observation,evidence_count,weight,last_seen_at")
      .gte("evidence_count", MIN_EVIDENCE)
      .order("weight", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(20),
    sb.from("zara_cta_preferences")
      .select("verdict,cta_text,evidence_count,last_seen_at")
      .gte("evidence_count", MIN_EVIDENCE)
      .order("evidence_count", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(20),
    sb.from("zara_rewrite_patterns")
      .select("before_phrase,after_phrase,context,evidence_count,last_seen_at")
      .gte("evidence_count", MIN_EVIDENCE)
      .order("evidence_count", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(20),
    // Recent approvals — used for timing intuition only.
    sb.from("zara_approval_decisions")
      .select("decided_at,decision,decided_via,draft_id")
      .eq("decision", "approve")
      .gte("decided_at", new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString())
      .order("decided_at", { ascending: false })
      .limit(200),
  ]);

  const tones = (tonesQ.data ?? []) as Array<{ dimension: string; rule: string }>;
  const style = (styleQ.data ?? []) as Array<{ category: string; observation: string }>;
  const ctas = (ctaQ.data ?? []) as Array<{ verdict: string; cta_text: string }>;
  const rewrites = (rewriteQ.data ?? []) as Array<{
    before_phrase: string; after_phrase: string; context: string | null;
  }>;
  const decisions = (timingQ.data ?? []) as Array<{ decided_at: string }>;

  const sections: string[] = [];

  if (tones.length) {
    // Dedupe by dimension — keep the highest-weighted rule per dimension.
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const t of tones) {
      if (seen.has(t.dimension)) continue;
      seen.add(t.dimension);
      lines.push(`- ${t.dimension}: ${t.rule}`);
      if (lines.length >= MAX_TONE) break;
    }
    if (lines.length) sections.push(`Tone rules Uzair has reinforced:\n${lines.join("\n")}`);
  }

  if (style.length) {
    const lines = style.slice(0, MAX_STYLE).map((s) => `- ${s.category}: ${s.observation}`);
    sections.push(`Style observations from Uzair's edits:\n${lines.join("\n")}`);
  }

  if (rewrites.length) {
    const lines = rewrites.slice(0, MAX_REWRITE).map((r) => {
      const ctx = r.context ? ` [${r.context}]` : "";
      // Truncate long phrases so the brief stays compact.
      const before = r.before_phrase.length > 80 ? r.before_phrase.slice(0, 77) + "…" : r.before_phrase;
      const after = r.after_phrase.length > 80 ? r.after_phrase.slice(0, 77) + "…" : r.after_phrase;
      return `- "${before}" → "${after}"${ctx}`;
    });
    sections.push(`Phrasing swaps Uzair prefers:\n${lines.join("\n")}`);
  }

  if (ctas.length) {
    const pref = ctas.filter((c) => c.verdict === "preferred").slice(0, MAX_CTA);
    const avoid = ctas.filter((c) => c.verdict === "avoid").slice(0, MAX_CTA);
    const parts: string[] = [];
    if (pref.length) parts.push(`Prefer CTAs: ${pref.map((c) => `"${c.cta_text}"`).join(", ")}`);
    if (avoid.length) parts.push(`Avoid CTAs: ${avoid.map((c) => `"${c.cta_text}"`).join(", ")}`);
    if (parts.length) sections.push(`Call-to-action preferences:\n- ${parts.join("\n- ")}`);
  }

  if (decisions.length >= 5) {
    // Histogram approvals into Pacific-time hour buckets (UTC offset = -8 / -7;
    // close enough for a qualitative "when does Uzair usually approve" hint).
    const counts = new Map<string, number>();
    for (const d of decisions) {
      const dt = new Date(d.decided_at);
      // Crude PT shift: subtract 8h. Good enough for bucket categorization.
      const ptHour = (dt.getUTCHours() + 16) % 24;
      const b = bucketHour(ptHour);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 2).map(([b, n]) => `${b} (${n})`).join(", ");
    if (top) sections.push(`Timing pattern: Uzair most often approves sends in the ${top}.`);
  }

  if (!sections.length) return "";

  return `<learned_preferences>\nThese are patterns from how Uzair has approved or edited your past drafts. Treat them as soft defaults — apply them unless this specific lead or message clearly calls for something different.\n\n${sections.join("\n\n")}\n</learned_preferences>`;
}
