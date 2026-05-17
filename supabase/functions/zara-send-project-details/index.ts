// One-click "Send Project Details" — picks top-N matching projects for a
// lead and queues a fully-branded HTML draft in zara_suggested_replies
// using the Project Showcase scaffold.
//
// Body: { contact_id: string; count?: number (default 3, max 5) }
// Bulk callers fan out (one call per contact_id) — no batching here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  escapeHtml,
  resolveSignatureHtml,
  interpolate,
  htmlToPlain,
  getZaraEmailPrefs,
} from "../_shared/zara-email-render.ts";
import { resolveAssignedToUuid } from "../_shared/zara-guardrails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { contact_id?: string; count?: number };
  try { body = await req.json(); } catch { return reply({ ok: false, error: "invalid json" }, 400); }
  const contactId = body?.contact_id;
  if (!contactId) return reply({ ok: false, error: "contact_id required" }, 400);
  const count = Math.min(Math.max(Number(body?.count ?? 3) || 3, 1), 5);

  // Resolve caller user id via auth header (service role insert, but we attribute to caller)
  let userId: string | null = null;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    try {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: auth } },
      });
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
    } catch (_) { /* ignore */ }
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Load lead ────────────────────────────────────────────────────────
  const { data: contact, error: cErr } = await sb.from("crm_contacts")
    .select("id,first_name,last_name,email,city,city_pref,budget_min,budget_max,bedrooms_preferred,tags,zara_enabled,language,assigned_to")
    .eq("id", contactId).maybeSingle();
  if (cErr || !contact) return reply({ ok: false, error: "contact not found" }, 404);

  // ── Match projects ───────────────────────────────────────────────────
  const cityHint = (contact as any).city_pref || (contact as any).city || null;
  let q = sb.from("crm_projects")
    .select("id,name,slug,city,developer,building_type,price_min,price_max,hero_image_url,marketing_url,brochure_url,completion_date,status")
    .limit(20);
  if (cityHint) q = q.ilike("city", `%${cityHint}%`);
  let { data: projects } = await q;
  let projectList = (projects ?? []) as any[];
  if (projectList.length < count) {
    // Backfill from any active project
    const { data: extras } = await sb.from("crm_projects")
      .select("id,name,slug,city,developer,building_type,price_min,price_max,hero_image_url,marketing_url,brochure_url,completion_date,status")
      .limit(20);
    const have = new Set(projectList.map((p) => p.id));
    (extras ?? []).forEach((p: any) => { if (!have.has(p.id)) { have.add(p.id); projectList.push(p); } });
  }

  // Score by budget overlap and recency-ish
  const bMax = Number((contact as any).budget_max ?? 0);
  const ranked = projectList.map((p) => {
    let score = 0;
    if (cityHint && p.city && String(p.city).toLowerCase().includes(String(cityHint).toLowerCase())) score += 5;
    if (bMax > 0 && p.price_min && p.price_max) {
      if (bMax >= p.price_min && bMax <= p.price_max * 1.15) score += 4;
      else if (bMax >= p.price_min) score += 2;
    }
    if (p.hero_image_url) score += 1;
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, count).map((r) => r.p);
  if (top.length === 0) return reply({ ok: false, error: "no projects available to recommend" }, 404);

  // ── Per-contact zara_enabled gate (does NOT block — drafting is opt-in regardless) ──
  // We allow drafting because this is an explicit agent action ("Send Project Details" button click).

  // ── Build email ──────────────────────────────────────────────────────
  const firstName = (contact as any).first_name || "there";
  const intro =
    `Hi ${escapeHtml(firstName)} — I pulled a few projects that fit what you've told me so far` +
    (cityHint ? ` in ${escapeHtml(String(cityHint))}` : "") +
    (bMax > 0 ? ` around your budget` : "") +
    `. Have a quick look at the three below and reply with the project name on any you'd like more on — I'll send deposit structures and comparable sold prices.`;

  const fmtMoney = (n: any) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2)}M`;
    if (v >= 1000) return `$${Math.round(v / 1000)}k`;
    return `$${v}`;
  };

  const cards_html = top.map((p) => {
    const meta = [p.city, p.developer, p.building_type].filter(Boolean).map(escapeHtml).join(" · ");
    const priceRange = (p.price_min || p.price_max)
      ? `${fmtMoney(p.price_min)}${p.price_min && p.price_max ? "–" : ""}${fmtMoney(p.price_max)}`
      : "";
    const ctaUrl = p.marketing_url || p.brochure_url || "https://presaleproperties.com";
    const hero = p.hero_image_url
      ? `<img src="${escapeHtml(p.hero_image_url)}" alt="${escapeHtml(p.name)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:8px;margin-bottom:14px;" />`
      : `<div style="background:#1a1a2e;color:#fff;padding:36px 16px;text-align:center;border-radius:8px;margin-bottom:14px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(p.name)}</div>`;
    const whyFits = whyForLead(p, contact);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;padding:16px;margin:0 0 16px 0;background:#fff;">
<tr><td>
${hero}
<div style="color:#1a1a2e;font-size:18px;font-weight:700;margin-bottom:4px;">${escapeHtml(p.name)}</div>
${meta ? `<div style="color:#888;font-size:13px;margin-bottom:6px;">${meta}</div>` : ""}
${priceRange ? `<div style="color:#1a1a2e;font-size:16px;margin-bottom:10px;">${escapeHtml(priceRange)}</div>` : ""}
<div style="color:#444;font-size:14px;line-height:1.55;margin-bottom:14px;">${escapeHtml(whyFits)}</div>
<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:13px;">View Floor Plans</a>
</td></tr></table>`;
  }).join("");

  const closing =
    `Worth me sending the deposit structures and comparable sold prices on any of these? Reply with the project name and I'll have it back in your inbox today.`;

  // ── Load Project Showcase scaffold ───────────────────────────────────
  const prefs = await getZaraEmailPrefs(sb);
  let { data: tpl } = await sb.from("crm_email_templates")
    .select("id, body_html, subject")
    .eq("slug", "project-showcase-zara").maybeSingle();
  if (!tpl && prefs.fallback_template_id) {
    ({ data: tpl } = await sb.from("crm_email_templates")
      .select("id, body_html, subject").eq("id", prefs.fallback_template_id).maybeSingle());
  }
  if (!tpl) return reply({ ok: false, error: "Project Showcase template missing — re-run migration" }, 500);

  const sigHtml = prefs.append_signature && userId ? await resolveSignatureHtml(sb, userId) : "";

  const vars: Record<string, string> = {
    first_name: firstName,
    intro_html: `<p style="margin:0 0 14px 0;">${intro}</p>`,
    cards_html,
    closing_html: `<p style="margin:0 0 14px 0;">${escapeHtml(closing)}</p>`,
    signature_html: sigHtml,
    unsubscribe: "{{unsubscribe}}",
  };
  const html = interpolate((tpl as any).body_html, vars);
  const subject = interpolate((tpl as any).subject ?? "Curated projects for {{first_name}}", vars);
  const text = htmlToPlain(html);

  // ── Insert into queue ────────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: ins, error: insErr } = await sb.from("zara_suggested_replies").insert({
    contact_id: contactId,
    channel: "email",
    draft_subject: subject,
    draft_text: text,
    draft_html: html,
    template_id_used: (tpl as any).id,
    inbound_text: "(agent-initiated · one-click Send Project Details)",
    inbound_at: now,
    intent: "send_project_details",
    status: "pending",
    consulted_sources: { projects: top.map((p) => ({ id: p.id, name: p.name, slug: p.slug })) },
  }).select("id").single();
  if (insErr) return reply({ ok: false, error: insErr.message }, 500);

  // Audit log (best-effort)
  try {
    await sb.from("zara_actions_log").insert({
      user_id: userId,
      contact_id: contactId,
      action: "tool_call",
      tool_name: "send_project_details",
      payload: { count, project_ids: top.map((p) => p.id) },
      result_summary: `queued draft ${ins.id}`,
    });
  } catch (_) { /* non-fatal */ }

  return reply({ ok: true, draft_id: ins.id, project_count: top.length, template_id: (tpl as any).id });
});

function whyForLead(p: any, c: any): string {
  const bits: string[] = [];
  const cityHint = c.city_pref || c.city;
  if (cityHint && p.city && String(p.city).toLowerCase().includes(String(cityHint).toLowerCase())) {
    bits.push(`Right in ${p.city}`);
  } else if (p.city) {
    bits.push(`${p.city} location`);
  }
  const bMax = Number(c.budget_max ?? 0);
  if (bMax > 0 && p.price_min && bMax >= p.price_min && bMax <= (p.price_max ?? p.price_min) * 1.15) {
    bits.push(`fits your budget`);
  }
  if (p.developer) bits.push(`built by ${p.developer}`);
  if (bits.length === 0) bits.push(`a strong fit for what you're looking for`);
  return bits.join(" · ") + ".";
}
