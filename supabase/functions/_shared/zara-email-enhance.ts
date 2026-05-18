// zara-email-enhance.ts
// Cross-cutting helpers used by every Zara email sender path:
//   - resolveTemplateForTrigger: trigger → template via crm_zara_trigger_map
//   - personalize: merge tokens from contact + zara_lead_memory
//   - pickSubjectVariant: stable per-contact A/B
//   - getSendWindow: respect agent quiet hours + trigger-preferred hours
//   - applyNeverQuote: strip quoted thread blocks when never_quote is set
//   - preflightQA: catch unrendered tokens, empty cards, missing signature
//   - hygiene: tracking-pixel strip for agent-test, subject cap, List-Unsubscribe
//   - fetchToneSample: last N inbound messages to feed the LLM as tone hint
//
// All functions are best-effort. Failures must never throw out of the
// caller — they return safe defaults so existing sends still succeed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SB = ReturnType<typeof createClient>;

// ── 1. Trigger → template registry ───────────────────────────────────────
export interface TriggerMapRow {
  trigger_kind: string;
  preferred_template_slug: string | null;
  fallback_template_slug: string | null;
  ab_subjects: string[];
  preferred_hour_start: number | null;
  preferred_hour_end: number | null;
  preferred_tz: string;
}

export async function getTriggerMap(sb: SB, trigger: string | null | undefined): Promise<TriggerMapRow | null> {
  if (!trigger) return null;
  try {
    const { data } = await sb.from("crm_zara_trigger_map")
      .select("trigger_kind, preferred_template_slug, fallback_template_slug, ab_subjects, preferred_hour_start, preferred_hour_end, preferred_tz")
      .eq("trigger_kind", trigger)
      .eq("is_active", true)
      .maybeSingle();
    return (data as any) ?? null;
  } catch (_) { return null; }
}

export async function resolveTemplateForTrigger(
  sb: SB,
  trigger: string | null | undefined,
  agentSlug?: string | null,
): Promise<{ id: string; slug: string | null; body_html: string; subject: string | null; name: string } | null> {
  const map = await getTriggerMap(sb, trigger);
  const slugs = [map?.preferred_template_slug, map?.fallback_template_slug].filter(Boolean) as string[];
  if (slugs.length === 0) return null;
  // Prefer agent-scoped template, fall back to team:presale
  for (const slug of slugs) {
    let q = sb.from("crm_email_templates")
      .select("id, slug, body_html, subject, name, owner_scope, owner_agent_slug")
      .eq("slug", slug)
      .eq("is_active", true);
    const { data } = await q;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) continue;
    if (agentSlug) {
      const mine = rows.find((r) => r.owner_agent_slug === agentSlug);
      if (mine) return mine;
    }
    const team = rows.find((r) => r.owner_scope === "team:presale") ?? rows[0];
    if (team) return team;
  }
  return null;
}

// ── 2. Personalization ───────────────────────────────────────────────────
export interface PersonalizeCtx {
  contact?: Record<string, any> | null;
  memory?: { facts?: Record<string, any> | null; summary?: string | null } | null;
  agent?: { first_name?: string | null; display_name?: string | null } | null;
  matched_project?: { name?: string | null; city?: string | null; neighborhood?: string | null; price_from?: number | null; price_to?: number | null } | null;
}

function fmtMoneyRange(lo?: number | null, hi?: number | null): string {
  const f = (n?: number | null) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
    if (v >= 1000) return `$${Math.round(v / 1000)}k`;
    return `$${v}`;
  };
  const a = f(lo); const b = f(hi);
  if (a && b) return `${a}–${b}`;
  return a || b || "";
}

export function buildMergeVars(ctx: PersonalizeCtx): Record<string, string> {
  const c = ctx.contact ?? {};
  const f = (ctx.memory?.facts ?? {}) as Record<string, any>;
  const p = ctx.matched_project ?? {};
  const firstName = c.first_name || (typeof c.name === "string" ? c.name.split(" ")[0] : "") || "there";
  const neighbourhood = c.neighborhood || c.neighbourhood || f.neighborhood || p.neighborhood || "";
  const projectName = f.matched_project || p.name || c.project_interest || "";
  const priceBand = fmtMoneyRange(c.budget_min, c.budget_max) || (f.price_band as string) || "";
  const timeline = c.timeline || f.timeline || f.move_in_timeline || "";
  const agentFirst = ctx.agent?.first_name || (ctx.agent?.display_name ?? "").split(" ")[0] || "";
  return {
    first_name: String(firstName),
    last_name: String(c.last_name ?? ""),
    name: String([c.first_name, c.last_name].filter(Boolean).join(" ") || firstName),
    city: String(c.city_pref || c.city || ""),
    neighbourhood: String(neighbourhood),
    neighborhood: String(neighbourhood),
    matched_project: String(projectName),
    project: String(projectName),
    price_band: String(priceBand),
    budget: String(priceBand),
    timeline: String(timeline),
    agent_first_name: String(agentFirst),
    agent_name: String(ctx.agent?.display_name ?? agentFirst),
  };
}

const TOKEN_RE = /(\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_]+)\s*\}|\{\$\s*([a-zA-Z0-9_]+)\s*\})/g;

export function personalize(input: string, vars: Record<string, string>): string {
  if (!input) return input;
  return input.replace(TOKEN_RE, (_m, _full, k1, k2, k3) => {
    const key = (k1 || k2 || k3 || "").toLowerCase();
    if (key in vars) return vars[key];
    // Common legacy aliases
    if (key === "firstname") return vars.first_name ?? "";
    if (key === "lastname") return vars.last_name ?? "";
    return _m; // leave token alone for QA to flag
  });
}

// ── 3. A/B subject ──────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
export function pickSubjectVariant(defaultSubject: string | null | undefined, variants: string[] | null | undefined, contactId: string): { subject: string; variant_index: number } {
  const list = (variants ?? []).filter((x) => x && x.trim().length > 0);
  if (list.length === 0) return { subject: defaultSubject ?? "", variant_index: -1 };
  const idx = hashStr(contactId) % list.length;
  return { subject: list[idx], variant_index: idx };
}

// ── 4. Quiet hours / preferred window ───────────────────────────────────
export interface SendWindowCheck { ok: boolean; reason?: string; nextSendAt?: string }

export async function getSendWindow(
  sb: SB,
  opts: { agentUserId?: string | null; trigger?: string | null; now?: Date }
): Promise<SendWindowCheck> {
  const now = opts.now ?? new Date();
  let qhStart: number | null = null, qhEnd: number | null = null, tz = "America/Vancouver";
  let prefStart: number | null = null, prefEnd: number | null = null;

  if (opts.agentUserId) {
    try {
      const { data } = await sb.from("crm_team")
        .select("quiet_hours_start, quiet_hours_end, quiet_hours_tz, zara_quiet_hours")
        .eq("user_id", opts.agentUserId).maybeSingle();
      if (data) {
        qhStart = (data as any).quiet_hours_start ?? null;
        qhEnd = (data as any).quiet_hours_end ?? null;
        tz = (data as any).quiet_hours_tz ?? tz;
        const zqh = (data as any).zara_quiet_hours;
        if (zqh && typeof zqh === "object") {
          if (typeof zqh.start === "number") qhStart = zqh.start;
          if (typeof zqh.end === "number") qhEnd = zqh.end;
        }
      }
    } catch (_) { /* ignore */ }
  }
  const map = await getTriggerMap(sb, opts.trigger);
  if (map) {
    prefStart = map.preferred_hour_start;
    prefEnd = map.preferred_hour_end;
    tz = map.preferred_tz || tz;
  }

  const hourInTz = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now).replace(/[^0-9]/g, "")) || now.getHours();

  // Quiet-hours block (start..end is the *blocked* window)
  if (qhStart != null && qhEnd != null && qhStart !== qhEnd) {
    const inQuiet = qhStart < qhEnd
      ? hourInTz >= qhStart && hourInTz < qhEnd
      : hourInTz >= qhStart || hourInTz < qhEnd; // wraps midnight
    if (inQuiet) return { ok: false, reason: "agent_quiet_hours", nextSendAt: hoursFromNowInTz(now, qhEnd, tz) };
  }
  // Preferred window (allow only when inside)
  if (prefStart != null && prefEnd != null && prefStart < prefEnd) {
    if (hourInTz < prefStart) return { ok: false, reason: "before_preferred_window", nextSendAt: hoursFromNowInTz(now, prefStart, tz) };
    if (hourInTz >= prefEnd) return { ok: false, reason: "after_preferred_window", nextSendAt: hoursFromNowInTz(now, prefStart, tz, /*nextDay*/ true) };
  }
  return { ok: true };
}

function hoursFromNowInTz(now: Date, targetHour: number, tz: string, nextDay = false): string {
  // Best-effort: compute "today at targetHour in tz". If already past, push 24h.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const y = get("year"), mo = get("month"), d = get("day"), h = get("hour");
  // Build local-ish ISO; treat tz as a label only.
  const target = new Date(now);
  const drift = (targetHour - h);
  target.setUTCHours(target.getUTCHours() + drift + (nextDay || drift <= 0 ? 24 : 0));
  void y; void mo; void d;
  return target.toISOString();
}

// ── 5. Never-quote sanitiser ────────────────────────────────────────────
export function applyNeverQuote(html: string, neverQuote?: { topics?: string[]; phrases?: string[]; strip_quoted?: boolean } | null): string {
  if (!html) return html;
  let out = html;
  // Always strip Gmail/Outlook quoted-history blocks when never_quote is configured.
  const hasConfig = !!(neverQuote && (neverQuote.phrases?.length || neverQuote.topics?.length || neverQuote.strip_quoted));
  if (hasConfig) {
    out = out.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
    out = out.replace(/<div[^>]*class="gmail_quote[^"]*"[\s\S]*?<\/div>/gi, "");
    out = out.replace(/<div[^>]*id="appendonsend"[\s\S]*$/gi, "");
  }
  for (const phrase of neverQuote?.phrases ?? []) {
    if (!phrase) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "[redacted]");
  }
  return out;
}

// ── 6. Pre-flight QA ────────────────────────────────────────────────────
export interface QAIssue { code: string; severity: "warn" | "block"; detail?: string }

export function preflightQA(opts: {
  to: string | null;
  subject: string | null;
  html: string;
  channel: string;
  projectsCount?: number;
  signaturePresent?: boolean;
  requireProjects?: boolean;
}): QAIssue[] {
  const issues: QAIssue[] = [];
  const { to, subject, html, channel } = opts;
  if (channel === "email") {
    if (!to || !/.+@.+\..+/.test(to)) issues.push({ code: "missing_recipient", severity: "block" });
    if (!subject || subject.trim().length < 3) issues.push({ code: "missing_subject", severity: "block" });
    if (!html || html.trim().length < 40) issues.push({ code: "empty_body", severity: "block" });
    // Unrendered tokens
    const leftover = (html ?? "").match(TOKEN_RE);
    if (leftover) {
      const uniq = Array.from(new Set(leftover.map((s) => s.replace(/[{}$\s]/g, "")))).filter((k) => k !== "unsubscribe" && k !== "signature_html");
      if (uniq.length > 0) issues.push({ code: "unrendered_tokens", severity: "block", detail: uniq.join(",") });
    }
    if (opts.requireProjects && !(opts.projectsCount && opts.projectsCount > 0)) {
      issues.push({ code: "no_projects_matched", severity: "block" });
    }
    if (opts.signaturePresent === false) issues.push({ code: "missing_signature", severity: "warn" });
    if (subject && subject.length > 140) issues.push({ code: "subject_too_long", severity: "warn", detail: String(subject.length) });
    // Common broken-image markers
    if (/<img[^>]+src=["']?(undefined|null|about:blank)["']?/i.test(html)) issues.push({ code: "broken_image", severity: "warn" });
  }
  return issues;
}

// ── 7. Hygiene / deliverability ─────────────────────────────────────────
export function hygiene(opts: {
  html: string;
  subject: string;
  contactTags?: string[];
  unsubscribeUrl?: string;
}): { html: string; subject: string; headers: Record<string, string> } {
  let html = opts.html ?? "";
  let subject = (opts.subject ?? "").trim();
  // Strip 1x1 tracking pixels for agent-test contacts (avoid polluting our own metrics)
  if ((opts.contactTags ?? []).includes("agent-test")) {
    html = html.replace(/<img[^>]+(?:width=["']?1["']?|height=["']?1["']?)[^>]*>/gi, "");
  }
  // Cap subject at 78 chars for mobile clients
  if (subject.length > 78) subject = subject.slice(0, 75).trimEnd() + "…";
  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return { html, subject, headers };
}

// ── 8. Tone-match sample ────────────────────────────────────────────────
export async function fetchToneSample(sb: SB, contactId: string, limit = 2): Promise<string> {
  try {
    const { data } = await sb.from("crm_messages")
      .select("content, direction, created_at")
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return "";
    return rows.reverse().map((r) => `> ${String(r.content ?? "").slice(0, 400)}`).join("\n");
  } catch (_) { return ""; }
}
