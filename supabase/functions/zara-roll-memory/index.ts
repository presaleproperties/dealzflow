// zara-roll-memory — incremental per-lead memory update.
//
// Called fire-and-forget after each conversation turn:
//   - from zara-suggest-reply (kind='draft') with {inbound_text, draft_text}
//   - from zara-execute-send  (kind='send')  with {outbound_text}
//
// Merges the new turn into the existing zara_lead_memory row using a small
// Claude call. Produces:
//   - summary: 3-5 sentence rolling narrative
//   - facts:   structured JSON (budget, timeline, decision_makers, motivations,
//              objections, must_haves, dealbreakers, financing_status,
//              preferred_neighborhoods, preferred_language, preferred_channel,
//              family_situation, urgency_signal, last_objection, next_steps,
//              key_quotes[])
//
// Idempotent and conservative: if Claude returns junk we keep prior memory.
// Never blocks the caller. Bumps version + turn_count atomically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/zara-guardrails.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const FACT_KEYS = [
  "budget_min",
  "budget_max",
  "timeline",
  "decision_makers",
  "motivations",
  "objections",
  "must_haves",
  "dealbreakers",
  "financing_status",
  "preferred_neighborhoods",
  "preferred_language",
  "preferred_channel",
  "family_situation",
  "urgency_signal",
  "last_objection",
  "next_steps",
  "key_quotes",
  "project_interest",
  "current_neighborhood",
] as const;

const SYSTEM_PROMPT = `You are Zara's memory consolidator for a real estate CRM.

You receive:
1. The lead's current MEMORY (summary + facts JSON).
2. ONE NEW TURN (inbound from the lead + optional outbound we sent).

Your job: merge the new turn into memory. Output a single JSON object with:
{
  "summary": "<3-5 sentence rolling narrative of this lead, written for the next AI to pick up cold>",
  "facts": {
    "budget_min": number|null,
    "budget_max": number|null,
    "timeline": string|null,                 // e.g. "buying within 3 months"
    "decision_makers": string[]|null,        // e.g. ["spouse", "father-in-law"]
    "motivations": string[]|null,            // why they want to buy
    "objections": string[]|null,             // ongoing concerns
    "must_haves": string[]|null,
    "dealbreakers": string[]|null,
    "financing_status": string|null,         // "pre-approved $1.2M / RBC", "shopping for broker"
    "preferred_neighborhoods": string[]|null,
    "preferred_language": string|null,       // ISO 639-1 or human label
    "preferred_channel": string|null,        // "sms" | "email" | "whatsapp" | "call"
    "family_situation": string|null,
    "urgency_signal": string|null,           // "hot" | "warm" | "cold" + 1-line why
    "last_objection": string|null,           // most recent objection raised
    "next_steps": string[]|null,             // what we committed to do next
    "project_interest": string|null,
    "current_neighborhood": string|null,
    "key_quotes": string[]|null              // max 5 short verbatim lead quotes
  }
}

CRITICAL RULES:
- Be conservative. If the new turn doesn't change a field, KEEP THE OLD VALUE.
- Never invent facts. If the lead never said their budget, leave budget_* null.
- key_quotes: keep at most 5, prefer newest + most revealing. Each quote <= 140 chars.
- objections/must_haves/etc: dedupe, keep at most 6 entries each.
- preferred_language: only set when explicit (lead writes in Punjabi, or asks for Hindi).
- Output ONLY the JSON object. No markdown, no commentary.`;

function safeParse(txt: string): any | null {
  try {
    const m = txt.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : txt);
  } catch {
    return null;
  }
}

function sanitizeFacts(incoming: any, prior: any): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(prior ?? {}) };
  if (!incoming || typeof incoming !== "object") return merged;
  for (const k of FACT_KEYS) {
    const v = (incoming as any)[k];
    if (v === undefined) continue;
    // null means "no new info" — keep prior
    if (v === null) continue;
    if (Array.isArray(v)) {
      // cap arrays at 6 (5 for key_quotes)
      const cap = k === "key_quotes" ? 5 : 6;
      merged[k] = v
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .slice(0, cap);
    } else if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > 0) merged[k] = trimmed.slice(0, 400);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      merged[k] = v;
    }
  }
  return merged;
}

async function consolidate(
  contactRow: any,
  prior: { summary: string; facts: Record<string, unknown> },
  turn: { inbound_text?: string; outbound_text?: string; draft_text?: string; kind: string },
): Promise<{ summary: string; facts: Record<string, unknown> } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const name = [contactRow.first_name, contactRow.last_name].filter(Boolean).join(" ") || "(unknown)";

  const userPrompt = `CURRENT MEMORY:
summary: ${prior.summary || "(empty)"}
facts: ${JSON.stringify(prior.facts ?? {}, null, 2)}

LEAD BASE INFO:
- name: ${name}
- tags: ${(contactRow.tags ?? []).join(", ") || "(none)"}
- project_interest: ${contactRow.project ?? "(none)"}
- budget hint: min=${contactRow.budget_min ?? "?"} max=${contactRow.budget_max ?? "?"}

NEW TURN (kind=${turn.kind}):
${turn.inbound_text ? `LEAD SAID:\n"""${turn.inbound_text}"""` : ""}
${turn.outbound_text ? `\nWE SENT:\n"""${turn.outbound_text}"""` : ""}
${turn.draft_text && !turn.outbound_text ? `\nWE DRAFTED (not yet sent):\n"""${turn.draft_text}"""` : ""}

Merge this turn into memory. Return ONLY the JSON object.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    console.warn("[zara-roll-memory] claude_failed", j);
    return null;
  }
  const raw = j?.content?.[0]?.text ?? "";
  const parsed = safeParse(raw);
  if (!parsed) return null;

  const facts = sanitizeFacts(parsed.facts, prior.facts);
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary.trim().slice(0, 1200)
      : prior.summary;

  return { summary, facts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      contact_id,
      inbound_text,
      outbound_text,
      draft_text,
      kind = "draft",
    } = body ?? {};

    if (!contact_id || (!inbound_text && !outbound_text && !draft_text)) {
      return json({ error: "contact_id + at least one of inbound_text/outbound_text/draft_text required" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const [{ data: contact }, { data: prior }] = await Promise.all([
      sb.from("crm_contacts").select("id, first_name, last_name, tags, project, budget_min, budget_max").eq("id", contact_id).maybeSingle(),
      sb.from("zara_lead_memory").select("summary, facts, turn_count, version").eq("contact_id", contact_id).maybeSingle(),
    ]);

    if (!contact) return json({ error: "contact_not_found" }, 404);

    const priorState = {
      summary: prior?.summary ?? "",
      facts: (prior?.facts as Record<string, unknown>) ?? {},
    };

    const next = await consolidate(contact, priorState, { inbound_text, outbound_text, draft_text, kind });
    if (!next) {
      // Still bump turn_count + last_rolled_at so we have a heartbeat.
      await sb.from("zara_lead_memory").upsert({
        contact_id,
        summary: priorState.summary,
        facts: priorState.facts,
        turn_count: (prior?.turn_count ?? 0) + 1,
        version: (prior?.version ?? 1) + 1,
        last_rolled_at: new Date().toISOString(),
        refreshed_at: new Date().toISOString(),
        refresh_reason: `roll_${kind}_noop`,
      });
      return json({ ok: true, updated: false, reason: "consolidator_returned_nothing" });
    }

    const { error: upErr } = await sb.from("zara_lead_memory").upsert({
      contact_id,
      summary: next.summary,
      facts: next.facts,
      signals: { ...(prior as any)?.signals ?? {}, last_roll_kind: kind },
      turn_count: (prior?.turn_count ?? 0) + 1,
      version: (prior?.version ?? 1) + 1,
      last_rolled_at: new Date().toISOString(),
      refreshed_at: new Date().toISOString(),
      refresh_reason: `roll_${kind}`,
    });

    if (upErr) {
      console.error("[zara-roll-memory] upsert_failed", upErr);
      return json({ error: upErr.message }, 500);
    }

    return json({ ok: true, updated: true, version: (prior?.version ?? 1) + 1 });
  } catch (e) {
    console.error("[zara-roll-memory]", e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
