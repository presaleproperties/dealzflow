// zara-analyze-rewrite — "Rewrite Like Uzair" learning loop.
//
// Compares Zara's original draft vs Uzair's final approved/rewritten version,
// asks the AI to extract tone/wording/CTA/pacing differences, and persists
// learned patterns into 4 memory tables + a row in zara_rewrite_diffs.
//
// POST {
//   draft_id?: string,                  // preferred — we'll load original from snapshot
//   original_subject?: string|null,
//   original_body?: string,
//   final_subject?: string|null,
//   final_body: string,
//   feedback_labels?: string[],         // ['too_robotic','sounds_like_uzair',...]
//   notes?: string,
//   was_approved?: boolean,
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-pro";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await anon.auth.getUser();
  return data.user ?? null;
}

// crude char-level distance proxy
function editDistance(a: string, b: string): number {
  return Math.abs((a || "").length - (b || "").length) +
    [...new Set((a || "").split(/\s+/))].filter(w => !(b || "").includes(w)).length;
}

type AnalysisShape = {
  summary?: string;
  tone_changes?: string[];
  wording_changes?: { before: string; after: string; context?: string }[];
  cta_changes?: { original?: string; final?: string; verdict?: "preferred" | "avoid"; note?: string }[];
  emotional_calibration?: string[];
  pacing?: string[];
  trust_building?: string[];
  style_observations?: { category: string; observation: string }[];
  tone_rules?: { dimension: string; rule: string }[];
};

const SYSTEM_PROMPT = `You are analyzing how Uzair (Director, The Presale Properties Group) rewrites drafts from Zara, his AI relationship manager.

Goal: extract the COACHING lessons — what Uzair's edits teach Zara about HIS voice and HIS sales behavior. Focus on:
- softer transitions
- conversational pacing
- emotional timing
- natural wording
- trust-building behavior
- relationship progression
- CTA calibration (never pushy; soft, optional, value-led)

You are NOT writing generic copywriting tips. You are decoding Uzair's personal style from concrete diffs.

If the final version is essentially identical to the original, say so and emit empty arrays — do NOT invent lessons.

Return STRICT JSON with this shape:
{
  "summary": "1-2 sentence plain summary of what changed",
  "tone_changes": ["..."],
  "wording_changes": [{"before":"...","after":"...","context":"opener|body|cta|closer|objection"}],
  "cta_changes": [{"original":"...","final":"...","verdict":"preferred|avoid","note":"..."}],
  "emotional_calibration": ["..."],
  "pacing": ["..."],
  "trust_building": ["..."],
  "style_observations": [{"category":"tone|pacing|wording|cta|opener|closer|emotional_calibration|trust_building","observation":"..."}],
  "tone_rules": [{"dimension":"softness|pacing|emotional_timing|pushiness|length|salesy|trust","rule":"..."}]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminCheck } = await svc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!adminCheck) return json({ error: "admin_required" }, 403);

    const body = await req.json().catch(() => ({}));
    let {
      draft_id,
      public_message_id,
      original_subject,
      original_body,
      final_subject,
      final_body,
      feedback_labels = [],
      notes,
      was_approved = true,
    } = body as any;

    let channel: string | null = null;
    let trigger_kind: string | null = null;
    let contact_id: string | null = null;

    if (draft_id) {
      const { data: d } = await svc
        .from("crm_zara_drafts")
        .select("original_subject, original_body, subject, body, channel, trigger_kind, contact_id")
        .eq("id", draft_id)
        .maybeSingle();
      if (d) {
        original_subject = original_subject ?? d.original_subject ?? d.subject;
        original_body = original_body ?? d.original_body ?? d.body;
        channel = d.channel;
        trigger_kind = d.trigger_kind;
        contact_id = d.contact_id;
      }
    }

    // Public-chat learning loop: allow review of a Zara reply made on
    // presaleproperties.com by passing public_message_id (zara_messages.id).
    // We treat the persisted assistant content as the "original" — the
    // reviewer (Uzair / admin) supplies the rewritten version as final_body.
    if (!original_body && public_message_id) {
      const { data: m } = await svc
        .from("zara_messages")
        .select("content, conversation_id, metadata, zara_conversations:conversation_id(presale_contact_id)")
        .eq("id", public_message_id)
        .eq("role", "assistant")
        .maybeSingle();
      if (m) {
        original_body = (m as any).content ?? "";
        channel = channel ?? "public_chat";
        trigger_kind = trigger_kind ?? "public_site_reply";
        contact_id = contact_id ?? (m as any).zara_conversations?.presale_contact_id ?? null;
      }
    }

    if (!original_body || !final_body) return json({ error: "missing_original_or_final" }, 400);

    const dist = editDistance(original_body || "", final_body || "");
    const trivial = dist < 4 && (original_body || "").trim() === (final_body || "").trim();

    let analysis: AnalysisShape = {};
    if (!trivial) {
      const userPrompt = [
        feedback_labels.length ? `Uzair's feedback labels: ${feedback_labels.join(", ")}` : "",
        notes ? `Uzair's note: ${notes}` : "",
        channel ? `Channel: ${channel}` : "",
        trigger_kind ? `Trigger: ${trigger_kind}` : "",
        ``,
        `--- Zara's ORIGINAL ${original_subject ? `(subject: ${original_subject})` : ""} ---`,
        original_body,
        ``,
        `--- Uzair's FINAL ${final_subject ? `(subject: ${final_subject})` : ""} ---`,
        final_body,
      ].filter(Boolean).join("\n");

      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt.slice(0, 12000) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      const txt = await r.text();
      if (!r.ok) return json({ error: "ai_failed", detail: txt.slice(0, 400) }, 502);
      try {
        const parsed = JSON.parse(txt);
        analysis = JSON.parse(parsed?.choices?.[0]?.message?.content ?? "{}") as AnalysisShape;
      } catch {
        analysis = {};
      }
    } else {
      analysis = { summary: "No meaningful rewrite — original kept." };
    }

    // Persist diff row
    const { data: diffRow, error: diffErr } = await svc
      .from("zara_rewrite_diffs")
      .insert({
        draft_id: draft_id ?? null,
        contact_id,
        channel,
        trigger_kind,
        original_subject,
        original_body,
        final_subject,
        final_body,
        edit_distance: dist,
        was_approved: !!was_approved,
        feedback_labels,
        analysis: analysis as any,
        notes: notes ?? null,
        reviewed_by: user.id,
      })
      .select("id")
      .single();
    if (diffErr) return json({ error: "diff_insert_failed", detail: diffErr.message }, 500);
    const diffId = diffRow.id;

    // Fan-out into memory tables (best-effort, skip if empty)
    const tasks: Promise<any>[] = [];

    // style_memory: from style_observations + tone_changes + emotional_calibration + pacing + trust_building
    const styleRows: { category: string; observation: string }[] = [];
    (analysis.style_observations ?? []).forEach(o => styleRows.push({ category: (o.category || "other").toLowerCase(), observation: o.observation }));
    (analysis.tone_changes ?? []).forEach(o => styleRows.push({ category: "tone", observation: o }));
    (analysis.emotional_calibration ?? []).forEach(o => styleRows.push({ category: "emotional_calibration", observation: o }));
    (analysis.pacing ?? []).forEach(o => styleRows.push({ category: "pacing", observation: o }));
    (analysis.trust_building ?? []).forEach(o => styleRows.push({ category: "trust_building", observation: o }));

    for (const s of styleRows) {
      if (!s.observation?.trim()) continue;
      tasks.push(svc.from("zara_style_memory").insert({
        category: s.category, observation: s.observation,
        source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
    }

    for (const w of (analysis.wording_changes ?? [])) {
      if (!w.before?.trim() || !w.after?.trim()) continue;
      tasks.push(svc.from("zara_rewrite_patterns").insert({
        before_phrase: w.before, after_phrase: w.after, context: w.context ?? null,
        source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
    }

    for (const c of (analysis.cta_changes ?? [])) {
      const preferred = c.final && (c.verdict ?? "preferred") === "preferred";
      const avoid = c.original && (c.verdict === "avoid" || c.verdict === undefined);
      if (preferred) tasks.push(svc.from("zara_cta_preferences").insert({
        cta_text: c.final, stance: "preferred", context: c.note ?? null,
        source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
      if (avoid && c.original && c.original !== c.final) tasks.push(svc.from("zara_cta_preferences").insert({
        cta_text: c.original, stance: "avoid", context: c.note ?? null,
        source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
    }

    for (const t of (analysis.tone_rules ?? [])) {
      if (!t.rule?.trim()) continue;
      tasks.push(svc.from("zara_tone_preferences").insert({
        dimension: (t.dimension || "softness").toLowerCase(), rule: t.rule,
        source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
    }

    // Also persist explicit feedback labels as tone rules so single-click feedback teaches Zara.
    const LABEL_RULES: Record<string, { dimension: string; rule: string }> = {
      too_robotic: { dimension: "softness", rule: "Sounded too robotic — use more natural, conversational phrasing." },
      too_pushy: { dimension: "pushiness", rule: "Felt too pushy — back off, offer optionality, no hard ask." },
      too_long: { dimension: "length", rule: "Too long — Uzair prefers shorter, more breathable messages." },
      weak_cta: { dimension: "softness", rule: "CTA was too weak/vague — be specific but soft (e.g. 'want me to send a quick walkthrough?')." },
      too_salesy: { dimension: "salesy", rule: "Too salesy — strip pitch language, lead with curiosity and helpfulness." },
      good_tone: { dimension: "softness", rule: "Tone landed well — keep this register and pacing." },
      good_investor_angle: { dimension: "trust", rule: "Investor angle landed — this framing resonates; reuse it for similar lead profiles." },
      needs_more_trust: { dimension: "trust", rule: "Needs more trust-building — anchor in market knowledge, Uzair's experience, or a soft proof point before any ask." },
      sounds_like_uzair: { dimension: "softness", rule: "Sounds like Uzair — this is a model example of his voice; weight it highly." },
      escalate_to_uzair: { dimension: "trust", rule: "Escalate to Uzair — this scenario should hand off, not auto-reply." },
    };
    for (const label of (feedback_labels as string[])) {
      const m = LABEL_RULES[label];
      if (!m) continue;
      tasks.push(svc.from("zara_tone_preferences").insert({
        dimension: m.dimension, rule: m.rule, source_diff_ids: [diffId], last_seen_at: new Date().toISOString(),
      }));
    }

    await Promise.allSettled(tasks);

    // Audit
    await svc.from("crm_audit_log").insert({
      action: "zara.rewrite_analyzed",
      table_name: "zara_rewrite_diffs",
      record_id: diffId,
      actor_label: "uzair",
      meta: { draft_id, feedback_labels, edit_distance: dist, fanout: tasks.length },
    }).then(() => {}, () => {});

    return json({ ok: true, diff_id: diffId, analysis, edit_distance: dist, trivial });
  } catch (e: any) {
    return json({ error: "analyze_failed", detail: String(e?.message ?? e) }, 500);
  }
});
