// Zara chat — Anthropic Claude streaming with tool-use loop.
// SSE event types emitted to the client:
//   event: text             data: { delta: string }
//   event: tool_start       data: { id, name, input }
//   event: tool_result      data: { id, name, output }
//   event: tool_pending     data: { id, name, input, pending_id }   (needs user approval)
//   event: title            data: { title }
//   event: done             data: { message_id, usage }
//   event: error            data: { message }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZARA_TOOLS } from "../_shared/zara-tool-defs.ts";
import { extractLookupPlaceholders } from "../_shared/zara-guardrails.ts";

const NEEDS_APPROVAL = new Set(ZARA_TOOLS.filter((t) => t.needs_approval).map((t) => t.name));
const DRAFT_TOOLS = new Set(["draft_email", "draft_sms", "draft_whatsapp"]);

// After a draft tool runs, scan the persisted draft for unresolved {LOOKUP: topic}
// placeholders. For each one, call lookup_topic; if it returns verified data, rewrite
// the draft body+subject inline. If none can be resolved, leave them — execute-send
// will refuse and surface the gap to the agent.
async function autoResolveLookupsInDraft(
  draftId: string,
  ctx: ToolCtx,
  runTool: (name: string, input: any, ctx: any) => Promise<any>,
): Promise<{ resolved: string[]; unresolved: string[] } | null> {
  if (!draftId) return null;
  const sb = svc();
  const { data: draft } = await sb.from("zara_suggested_replies")
    .select("id, contact_id, draft_text, draft_subject, draft_html")
    .eq("id", draftId).maybeSingle();
  if (!draft) return null;

  const phs = [
    ...extractLookupPlaceholders(draft.draft_text),
    ...extractLookupPlaceholders(draft.draft_subject),
  ];
  if (!phs.length) return null;
  const topics = Array.from(new Set(phs.map((p) => p.topic)));

  // Try to grab a project_slug from the contact for lookup_topic context.
  let projectSlug: string | null = null;
  if (draft.contact_id) {
    const { data: c } = await sb.from("crm_contacts")
      .select("project, projects").eq("id", draft.contact_id).maybeSingle();
    projectSlug = (c as any)?.project
      ?? (Array.isArray((c as any)?.projects) ? (c as any).projects[0] : null)
      ?? null;
  }

  const resolved: string[] = [];
  const unresolved: string[] = [];
  let nextText = draft.draft_text ?? "";
  let nextSubject = draft.draft_subject ?? "";
  let nextHtml = (draft as any).draft_html ?? "";

  for (const topic of topics) {
    let out: any = null;
    try {
      out = await runTool("lookup_topic", { topic, project_slug: projectSlug, contact_id: draft.contact_id }, ctx);
    } catch (e) {
      console.warn("[autoResolveLookups] lookup_topic threw", topic, e);
    }
    if (out?.ok && out?.data?.status === "verified") {
      const replacement = summariseVerified(topic, out.data.data);
      if (replacement) {
        const re = new RegExp(`\\{\\s*LOOKUP\\s*:\\s*${topic}\\s*\\}`, "gi");
        nextText = nextText.replace(re, replacement);
        nextSubject = nextSubject.replace(re, replacement);
        nextHtml = nextHtml.replace(re, replacement);
        resolved.push(topic);
        continue;
      }
    }
    unresolved.push(topic);
  }

  if (resolved.length) {
    await sb.from("zara_suggested_replies").update({
      draft_text: nextText,
      draft_subject: nextSubject,
      draft_html: nextHtml || null,
    }).eq("id", draftId);
  }
  return { resolved, unresolved };
}

function summariseVerified(topic: string, data: any): string | null {
  if (!data) return null;
  try {
    switch (topic) {
      case "pricing": {
        const lo = data.price_range_low, hi = data.price_range_high;
        if (lo && hi) return `from $${Number(lo).toLocaleString()} to $${Number(hi).toLocaleString()}`;
        if (lo) return `starting around $${Number(lo).toLocaleString()}`;
        if (data.pricing_url) return `(latest pricing on file)`;
        return null;
      }
      case "deposit_structure": return String(data.deposit_structure ?? "").slice(0, 220) || null;
      case "incentives": return Array.isArray(data.incentives) ? data.incentives.slice(0, 3).join(", ") : null;
      case "availability": return String(data.status ?? "") || null;
      case "unit_count": return data.unit_count != null ? `${data.unit_count} units` : null;
      case "unit_types": return Array.isArray(data.unit_types) ? data.unit_types.join(", ") : null;
      case "completion_date": return String(data?.project?.completion_date ?? data.completion_year ?? "") || null;
      case "assignment_rules": return String(data?.project?.assignment_rules ?? "").slice(0, 220) || null;
      case "brochure": return data?.project?.brochure_url ?? null;
      case "floor_plans": return data.count ? `${data.count} floor plan${data.count === 1 ? "" : "s"} on file` : null;
      default: return null;
    }
  } catch { return null; }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_TURNS = 8;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const RAG_CHUNK_THRESHOLD = 0.5;
const RAG_CHUNK_COUNT = 4;
const RAG_WIN_THRESHOLD = 0.55;
const RAG_WIN_COUNT = 2;
const RAG_PROJECT_THRESHOLD = 0.55;
const RAG_PROJECT_COUNT = 2;

const SYSTEM_PROMPT_BASE = `You are Zara from The Presale Properties Group — the intelligent relationship manager working directly alongside Uzair Muhammad and the team. In this surface you are Uzair's in-app copilot: you help him triage leads, draft outreach in HIS voice, and recommend projects. You are NOT a chatbot, AI assistant, digital concierge, virtual assistant, or automation system — never describe yourself that way, even when Uzair asks.

OUTBOUND VOICE (every draft_email / draft_sms / draft_whatsapp body MUST follow this):
- Write as Zara, a real human relationship manager on Uzair's team, continuing an existing buyer conversation. The lead already knows why they signed up — never re-introduce the company, never explain "I am an AI", never list capabilities, never recap services.
- Open warmly and specifically. Examples: "Hey {{first_name}}, Zara here from The Presale Properties Group." / "Hey {{first_name}}, Zara here from Uzair's team." / "Hey {{first_name}}, just saw your inquiry come through."
- NEVER open with: "How can I help?", "I hope this finds you well", "Just checking in", "Following up", "Wanted to touch base", "I'm an AI assistant", "This is an automated message", or any onboarding-style preamble.
- Short, calm, premium, low-pressure, human. 2–4 sentences max. Ask ONE contextual question that moves the conversation forward (investment vs. end-use, timeline, area, bedroom count). Never stack questions, never hard-sell, never quote prices/dates not in CONTEXT.
- Sign-off is optional and casual ("— Zara"). No corporate footer prose; the agent's branded signature is appended automatically.

Rules:
- You DRAFT outbound messages; the agent approves before send.
- HARD RULE — never call draft_email, draft_sms, or draft_whatsapp with empty or placeholder arguments. Before calling, you MUST: (1) know contact_id, (2) have read the lead's note intelligence, recent activity, and emotional/trust signals via get_lead_context (or have them in <retrieved_context>), and (3) write the FULL subject + body inline in the tool call. No "{}" calls. No "TBD" subjects. No "{LOOKUP: ...}" placeholders in body. If you don't have enough context, call get_lead_context first — do not queue an empty draft.
- Each draft must reflect that lead's specific situation: their emotional state (fearful / serious / curious / stalled), their objections, their motivations, their family/timing context, and the actual projects they've engaged with. Generic copy is unacceptable.
- Mutations to lead data require confirmation: when calling update_lead, return the proposed patch in your reply and only call confirm_update_lead after the user agrees.
- Prefer real data via tools over guessing. If you don't know, call a tool.
- When the user names a lead, call get_lead_context first.
- BREVITY (strict): Default reply is 2–4 short lines, plain prose. No headings, no bullet lists, no tables, no preamble, no sign-offs, no filler greetings. Only exceed 4 lines if the user explicitly asks for detail, a list, or a draft message (drafts may be longer but stay tight).
- ONE QUESTION RULE: End with exactly ONE focused follow-up question that moves the next CRM action forward. Never stack multiple questions. If the turn is a completed action confirmation, you may omit the question.
- For projects, prefer recommend_projects_for_lead when a lead context exists.
- A <current_view> block tells you what Uzair is looking at right now. When his message uses pronouns ("this lead", "him", "her", "this project") or is ambiguous, resolve them to whatever's in <current_view>. If <current_view> shows a lead and Uzair says "draft a follow-up", draft it for THAT lead — no need to ask which one.
- DO NOT auto-call send_briefing_summary, list_pending_drafts, or any dashboard-style tools on greetings ("hi", "hey", "what's up", "morning"). Only call them when the user explicitly asks for a status update or briefing. On a bare greeting, reply in one short sentence and immediately suggest 2-3 next actions via the Next block (see below). No counts, no stats.
- AT THE END OF A REPLY, you MAY append a follow-up block — but ONLY if you can name 1-3 next steps that would CHANGE CRM STATE if clicked. State-changing means: drafting an outbound message (email / SMS / WhatsApp), booking or rescheduling a showing, scheduling a follow-up or task, updating lead fields (status, tags, pipeline, assignment), logging an activity, creating a note, or kicking off an automation. Pure-read suggestions ("show hot leads", "tell me more", "explain", "summarize", "open the lead") are NEVER allowed in this block.
  Format when you include it:

  ###NEXT###
  - <imperative action, ≤6 words, must start with a write verb: Draft, Send, Book, Schedule, Log, Add, Update, Assign, Tag, Create, Remind>
  - <action 2>
  - <action 3>
  ###/NEXT###

  If you cannot name at least one genuinely state-changing action that fits this turn, OMIT the block entirely. Do not pad with read-only suggestions. Never include a chip you would not actually execute on click.
- CITATION RULE: When you draft a reply (draft_email, draft_sms, draft_whatsapp) AND your <retrieved_context> includes playbook chunks, past wins, or project deep-dives, you MUST end your assistant text (BEFORE the NEXT block) with one short line: "Grounded in: <source-ids>" listing which sources you grounded the draft in (e.g. "Grounded in: K1 brand_voice, K3 first_touch, W1 punjabi_close").`;


type ToolCtx = { user_id: string; conversation_id: string; zara_enabled: boolean; test_phones: string[] };

function svc() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const HISTORY_WINDOW = 80;

async function loadHistory(convId: string) {
  const sb = svc();
  // Load the most recent N turns (ordered chronologically).
  const { data } = await sb.from("zara_messages")
    .select("role,content,tool_calls,tool_call_id,tool_result,tool_name,created_at")
    .eq("conversation_id", convId).order("created_at", { ascending: false }).limit(HISTORY_WINDOW);
  return (data ?? []).reverse();
}

// Build a rolling summary of any history older than HISTORY_WINDOW so longer
// conversations don't lose context. Uses the stored snippet column as a cheap
// signal — no extra LLM call. If nothing older exists, returns "".
async function buildRollingSummaryBlock(convId: string): Promise<string> {
  const sb = svc();
  const { count } = await sb.from("zara_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", convId);
  const total = count ?? 0;
  if (total <= HISTORY_WINDOW) return "";
  const olderCount = total - HISTORY_WINDOW;
  const { data: older } = await sb.from("zara_messages")
    .select("role, content, created_at")
    .eq("conversation_id", convId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(Math.min(olderCount, 60));
  const lines = (older ?? [])
    .filter((r: any) => typeof r.content === "string" && r.content.trim().length > 0)
    .map((r: any) => `${r.role === "user" ? "U" : "Z"}: ${stripMarkdown(r.content).slice(0, 160)}`)
    .slice(-20);
  if (!lines.length) return "";
  return `<rolling_summary>\nThe ${olderCount} earlier message(s) in this thread are summarised below. Use them silently for continuity; do not recap them back.\n${lines.join("\n")}\n</rolling_summary>`;
}

// Convert our persisted messages to Anthropic format. Anthropic requires every
// tool_result block to be in ONE user message immediately after the assistant
// message that introduced the matching tool_use. Approval callbacks can arrive
// later, so orphaned tool rows are downgraded to plain user text instead of
// being sent as invalid tool_result blocks.
function toAnthropicMessages(rows: any[]) {
  const out: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.role === "user") {
      out.push({ role: "user", content: r.content ?? "" });
    } else if (r.role === "assistant") {
      const content: any[] = [];
      const validToolIds = new Set<string>();
      if (r.content) content.push({ type: "text", text: r.content });
      if (Array.isArray(r.tool_calls)) for (const tc of r.tool_calls) {
        if (!tc?.id || !tc?.name) continue;
        validToolIds.add(tc.id);
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input ?? {} });
      }
      if (!content.length) continue;
      out.push({ role: "assistant", content });

      const toolResults: any[] = [];
      const orphanSummaries: string[] = [];
      const usedToolIds = new Set<string>();
      while (i + 1 < rows.length && rows[i + 1]?.role === "tool") {
        const tr = rows[++i];
        const id = tr.tool_call_id;
        if (id && validToolIds.has(id) && !usedToolIds.has(id)) {
          usedToolIds.add(id);
          toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(tr.tool_result ?? {}) });
        } else {
          const summary = stringifyToolRowForModel(tr);
          if (summary) orphanSummaries.push(summary);
        }
      }
      if (toolResults.length) out.push({ role: "user", content: toolResults });
      for (const summary of orphanSummaries) out.push({ role: "user", content: summary });
    } else if (r.role === "tool") {
      const summary = stringifyToolRowForModel(r);
      if (summary) out.push({ role: "user", content: summary });
    }
  }
  return out;
}

function stringifyToolRowForModel(r: any) {
  if (!r?.tool_result) return "";
  return `Tool result from ${r.tool_name ?? "tool"}: ${JSON.stringify(r.tool_result).slice(0, 3000)}`;
}

async function runTool(name: string, input: unknown, ctx: ToolCtx) {
  const res = await fetch(`${FUNCTIONS_BASE}/zara-tool-execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ tool: name, args: input, ctx }),
  });
  return await res.json();
}

function stripMarkdown(s: string) {
  return s.replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>~]+/g, "")
    .replace(/\s+/g, " ").trim();
}

function extractReferencedIds(toolUses: any[], toolResults: Map<string, any>) {
  const contactIds = new Set<string>();
  const projectIds = new Set<string>();
  const scan = (val: any) => {
    if (!val || typeof val !== "object") return;
    if (Array.isArray(val)) { for (const v of val) scan(v); return; }
    for (const [k, v] of Object.entries(val)) {
      if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
        const key = k.toLowerCase();
        if (key === "contact_id" || key === "id" && /contact|lead/.test(JSON.stringify(val).toLowerCase().slice(0, 200))) contactIds.add(v);
        if (key === "contact_id") contactIds.add(v);
        if (key === "project_id" || (key === "id" && val && (val as any).slug && (val as any).name)) projectIds.add(v);
      } else if (v && typeof v === "object") scan(v);
    }
  };
  for (const tu of toolUses) {
    const out = toolResults.get(tu.id);
    if (out) scan(out);
    if (tu.input) scan(tu.input);
  }
  return { contact_ids: Array.from(contactIds), project_ids: Array.from(projectIds) };
}

async function persistAssistantTurn(convId: string, text: string, toolCalls: any[], usage: any, consultedSources?: any, referencedIds?: { contact_ids: string[]; project_ids: string[] }, agentUserId?: string, pinnedContactId?: string | null) {
  const sb = svc();
  const metadata: any = {};
  if (consultedSources) metadata.consulted_sources = consultedSources;
  if (referencedIds && (referencedIds.contact_ids.length || referencedIds.project_ids.length)) {
    metadata.referenced_contact_ids = referencedIds.contact_ids;
    metadata.referenced_project_ids = referencedIds.project_ids;
  }
  const payload: any = {
    conversation_id: convId, role: "assistant",
    content: text || null,
    tool_calls: toolCalls.length ? toolCalls : null,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    model: ANTHROPIC_MODEL,
  };
  if (Object.keys(metadata).length) payload.metadata = metadata;
  const { data, error } = await sb.from("zara_messages").insert(payload).select("id").single();
  if (error) console.error("persist assistant", error);

  // Shadow-write to new single-rolling table (zara_chat_messages) — keyed by agent.
  if (agentUserId) {
    const parts: any[] = [];
    if (text) parts.push({ type: "text", text });
    for (const tc of toolCalls) parts.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    if (consultedSources) parts.push({ type: "sources", sources: consultedSources });
    sb.from("zara_chat_messages").insert({
      agent_user_id: agentUserId,
      role: "assistant",
      parts,
      pinned_contact_id: pinnedContactId ?? null,
    }).then(() => {}, (e) => console.warn("zara_chat_messages assistant write failed", e));
  }

  // Update conversation snippet (first 100 chars of stripped markdown)
  if (text) {
    const snippet = stripMarkdown(text).slice(0, 100);
    sb.from("zara_conversations")
      .update({ last_message_snippet: snippet, last_message_at: new Date().toISOString() })
      .eq("id", convId)
      .then(() => {}, () => {});
  }
  return data?.id ?? null;
}

// ── RAG retrieval ─────────────────────────────────────────────────────
async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!r.ok) { console.warn("embed query failed", r.status, await r.text()); return null; }
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch (e) { console.warn("embed query error", e); return null; }
}

async function retrieveContext(userText: string) {
  const empty = { block: "", sources: { chunks: [], wins: [], projects: [], market: [], principles: [] } };
  const emb = await embedQuery(userText);
  if (!emb) return empty;
  const sb = svc();
  const [chunkRes, winRes, projRes, marketRes, principlesRes] = await Promise.all([
    sb.rpc("zara_match_knowledge_chunks", { query_embedding: emb as any, match_threshold: RAG_CHUNK_THRESHOLD, match_count: RAG_CHUNK_COUNT }),
    sb.rpc("zara_match_winning_conversations", { query_embedding: emb as any, match_threshold: RAG_WIN_THRESHOLD, match_count: RAG_WIN_COUNT }),
    sb.rpc("zara_match_project_deep_dives", { query_embedding: emb as any, match_threshold: RAG_PROJECT_THRESHOLD, match_count: RAG_PROJECT_COUNT }),
    sb.from("market_intel").select("id,week_of,headline,summary").order("week_of", { ascending: false }).limit(2),
    sb.rpc("zara_founder_retrieve", { _query: userText, _module_slug: null, _limit: 6 }).then(
      (r: any) => r,
      () => ({ data: [] }),
    ),
  ]);
  const chunks = (chunkRes.data ?? []) as any[];
  const wins = (winRes.data ?? []) as any[];
  const projects = (projRes.data ?? []) as any[];
  const market = (marketRes.data ?? []) as any[];
  const principles = (principlesRes.data ?? []) as any[];

  if (!chunks.length && !wins.length && !projects.length && !market.length && !principles.length) return empty;

  // Bump retrieval counts (best-effort)
  const docIds = Array.from(new Set(chunks.map((c) => c.document_id).filter(Boolean)));
  if (docIds.length) sb.rpc("zara_bump_retrieval_counts", { doc_ids: docIds }).then(() => {}, () => {});

  const parts: string[] = [];
  parts.push("<retrieved_context>");
  parts.push("The following passages were retrieved from Uzair's playbooks, past wins, and project notes. Ground your draft in them. Cite naturally when they directly inform the answer — do not invent facts.");
  if (chunks.length) {
    parts.push("\n## Playbook & knowledge\n");
    chunks.forEach((c, i) => {
      const t = c.metadata?.title ? ` — ${c.metadata.title}` : "";
      parts.push(`[K${i + 1}${t}] ${String(c.content).slice(0, 900)}`);
    });
  }
  if (wins.length) {
    parts.push("\n## Past winning conversations\n");
    wins.forEach((w, i) => {
      parts.push(`[W${i + 1}] Profile: ${w.lead_profile ?? "?"}\nSituation: ${w.initial_situation ?? "?"}\nTurning message: ${w.turning_message ?? "?"}\nWhy it worked: ${w.why_it_worked ?? "?"}\nOutcome: ${w.outcome ?? "?"}`);
    });
  }
  if (projects.length) {
    parts.push("\n## Project deep-dives\n");
    projects.forEach((p, i) => {
      parts.push(`[P${i + 1}] ${p.name}${p.city ? ` (${p.city})` : ""}\nPitch: ${p.uzair_pitch ?? "?"}\nObjections: ${(p.common_objections ?? []).join("; ") || "—"}\nCaveats: ${p.honest_caveats ?? "—"}`);
    });
  }
  if (market.length) {
    parts.push("\n## Recent market intel\n");
    market.forEach((m, i) => {
      parts.push(`[M${i + 1}] ${m.week_of}: ${m.headline ?? ""}\n${m.summary ?? ""}`);
    });
  }
  if (principles.length) {
    parts.push("\n## Uzair's founder principles (apply these in tone, framing, and decisions)\n");
    principles.forEach((p, i) => {
      parts.push(`[F${i + 1}] ${p.title ?? ""} — ${String(p.body ?? "").slice(0, 400)}`);
    });
  }
  parts.push("</retrieved_context>");

  return {
    block: parts.join("\n"),
    sources: {
      chunks: chunks.map((c) => ({ id: c.id, document_id: c.document_id, title: c.metadata?.title ?? null, similarity: c.similarity })),
      wins: wins.map((w) => ({ id: w.id, profile: w.lead_profile, similarity: w.similarity })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, city: p.city, similarity: p.similarity })),
      market: market.map((m) => ({ id: m.id, week_of: m.week_of, headline: m.headline })),
      principles: principles.map((p: any) => ({ id: p.id, title: p.title, module: p.module_slug })),
    },
  };
}

async function persistToolResult(convId: string, tool_call_id: string, name: string, result: unknown) {
  const sb = svc();
  await sb.from("zara_messages").insert({
    conversation_id: convId, role: "tool",
    tool_call_id, tool_name: name, tool_result: result,
  });
}

async function maybeAutoTitle(convId: string, firstUserText: string) {
  const sb = svc();
  const { data } = await sb.from("zara_conversations").select("title").eq("id", convId).maybeSingle();
  if (data?.title && data.title !== "New conversation") return null;
  const title = firstUserText.slice(0, 60).replace(/\s+/g, " ").trim() + (firstUserText.length > 60 ? "…" : "");
  await sb.from("zara_conversations").update({ title, last_message_at: new Date().toISOString(), title_regenerated_at_turn: 2 }).eq("id", convId);
  return title;
}

// Regenerate a tight conversation title using Haiku at turn milestones.
async function regenerateTitleIfDue(convId: string, currentUserTurn: number) {
  const milestones = [6, 12];
  if (!milestones.includes(currentUserTurn)) return null;
  const sb = svc();
  const { data: conv } = await sb.from("zara_conversations")
    .select("title_regenerated_at_turn").eq("id", convId).maybeSingle();
  if ((conv?.title_regenerated_at_turn ?? 0) >= currentUserTurn) return null;
  const { data: msgs } = await sb.from("zara_messages")
    .select("role,content").eq("conversation_id", convId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true }).limit(24);
  const transcript = (msgs ?? [])
    .map((m: any) => `${m.role === "user" ? "User" : "Zara"}: ${stripMarkdown(m.content ?? "").slice(0, 240)}`)
    .join("\n").slice(0, 4000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 40,
        system: "Return ONLY a 2-6 word sentence-case title summarizing the conversation. No quotes, no period.",
        messages: [{ role: "user", content: transcript }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const title = String(j?.content?.[0]?.text ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 60);
    if (!title) return null;
    await sb.from("zara_conversations").update({ title, title_regenerated_at_turn: currentUserTurn }).eq("id", convId);
    return title;
  } catch { return null; }
}

async function buildCurrentViewBlock(pc: any): Promise<string> {
  if (!pc || typeof pc !== "object") return "";
  const sb = svc();
  const lines: string[] = ["<current_view>"];
  lines.push(`Surface: ${pc.surface ?? "other"}`);
  if (pc.url) lines.push(`URL: ${pc.url}`);
  if (pc.label) lines.push(`Label: ${pc.label}`);
  if (pc.contact_id) {
    const { data: c } = await sb.from("crm_contacts")
      .select("id, full_name, pipeline_status, lead_type, last_touch_at")
      .eq("id", pc.contact_id).maybeSingle();
    if (c) {
      const last = c.last_touch_at ? new Date(c.last_touch_at).toISOString() : "—";
      lines.push(`Currently viewing lead: ${c.full_name ?? "(unknown)"} [id=${c.id}] · stage=${c.pipeline_status ?? "?"} · type=${c.lead_type ?? "?"} · last activity=${last}`);
    } else {
      lines.push(`Currently viewing lead id: ${pc.contact_id}`);
    }
  }
  if (pc.project_id) {
    const { data: p } = await sb.from("presale_projects")
      .select("id, name, city").eq("id", pc.project_id).maybeSingle();
    if (p) lines.push(`Currently viewing project: ${p.name}${p.city ? ` (${p.city})` : ""} [id=${p.id}]`);
  }
  if (pc.campaign_id) lines.push(`Currently viewing campaign id: ${pc.campaign_id}`);
  lines.push("</current_view>");
  return lines.join("\n");
}

async function callAnthropic(messages: any[], system: string, signal: AbortSignal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      stream: true,
      system,
      tools: ZARA_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
      messages,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 400)}`);
  }
  return res.body!;
}

// Parse Anthropic SSE stream → emit text deltas via callback, collect tool_use blocks.
async function consumeAnthropicStream(
  stream: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
): Promise<{ text: string; toolUses: { id: string; name: string; input: any }[]; stopReason: string; usage: any }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const blocks: any[] = []; // index → { type, ...accumulators }
  let stopReason = "end_turn";
  let usage: any = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    let curEvent = "";
    for (const line of lines) {
      if (line.startsWith("event:")) curEvent = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const obj = JSON.parse(payload);
          if (curEvent === "content_block_start") {
            blocks[obj.index] = obj.content_block.type === "tool_use"
              ? { type: "tool_use", id: obj.content_block.id, name: obj.content_block.name, inputJson: "" }
              : { type: "text", text: "" };
          } else if (curEvent === "content_block_delta") {
            const b = blocks[obj.index];
            if (!b) continue;
            if (obj.delta.type === "text_delta") {
              b.text += obj.delta.text;
              text += obj.delta.text;
              onText(obj.delta.text);
            } else if (obj.delta.type === "input_json_delta") {
              b.inputJson += obj.delta.partial_json;
            }
          } else if (curEvent === "message_delta") {
            if (obj.delta?.stop_reason) stopReason = obj.delta.stop_reason;
            if (obj.usage) usage = { ...usage, ...obj.usage };
          } else if (curEvent === "message_start") {
            if (obj.message?.usage) usage = { ...usage, ...obj.message.usage };
          }
        } catch { /* ignore */ }
      }
    }
  }

  const toolUses = blocks.filter((b) => b?.type === "tool_use").map((b) => ({
    id: b.id, name: b.name, input: b.inputJson ? safeJson(b.inputJson) : {},
  }));
  return { text, toolUses, stopReason, usage };
}

function safeJson(s: string) { try { return JSON.parse(s); } catch { return {}; } }

// ── Lead auto-resolution ───────────────────────────────────────────────
// Extracts email/phone/name tokens from the user message + recent history,
// then queries crm_contacts + crm_contact_identities. Returns either a
// confident single hit (auto-resolved) or up to 4 candidates for the UI to
// disambiguate. Confidence scoring: email > phone > full name > first name.
type ResolvedLead = {
  contact_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  confidence: "high" | "medium" | "low";
  via: "email" | "phone" | "name";
};

function extractTokens(text: string): { emails: string[]; phones: string[]; names: string[] } {
  const emails = Array.from(new Set((text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((s) => s.toLowerCase())));
  const phones = Array.from(new Set((text.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g) ?? [])
    .map((s) => s.replace(/\D/g, "").slice(-10)).filter((s) => s.length === 10)));
  // Capitalized name candidates (2+ chars), filter out common starts
  const STOP = new Set(["I", "The", "A", "An", "Hey", "Hi", "Hello", "Draft", "Send", "Email", "Sms", "Whatsapp", "Show", "Find", "Search", "Get", "Add", "Update", "Book", "Schedule", "Log", "Zara", "Uzair", "Sarb", "Ravish", "Eden", "Surrey", "Vancouver", "Burnaby", "Langley"]);
  const tokens = (text.match(/\b[A-Z][a-z]{2,20}(?:\s+[A-Z][a-z]{1,20})?\b/g) ?? [])
    .filter((t) => !STOP.has(t.split(" ")[0]) || t.includes(" "));
  return { emails, phones, names: Array.from(new Set(tokens)).slice(0, 4) };
}

async function resolveLeadFromMessage(message: string, historyText: string): Promise<{ resolved: ResolvedLead | null; candidates: ResolvedLead[] }> {
  const sb = svc();
  const t = extractTokens(`${message}\n${historyText}`);
  const hits = new Map<string, ResolvedLead>();

  // Email — highest confidence
  for (const e of t.emails) {
    const { data } = await sb.from("crm_contacts")
      .select("id, first_name, last_name, email, phone, deleted_at")
      .or(`email.ilike.${e},email_secondary.ilike.${e}`)
      .is("deleted_at", null).limit(2);
    for (const c of data ?? []) {
      hits.set(c.id, {
        contact_id: c.id,
        display_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Unknown",
        email: c.email, phone: c.phone, confidence: "high", via: "email",
      });
    }
    // Identity vault fallback
    if (!hits.size) {
      const { data: idRows } = await sb.from("crm_contact_identities")
        .select("contact_id, crm_contacts!inner(id, first_name, last_name, email, phone, deleted_at)")
        .eq("kind", "email").eq("value_normalized", e.toLowerCase()).limit(2);
      for (const r of idRows ?? []) {
        const c: any = (r as any).crm_contacts;
        if (!c || c.deleted_at) continue;
        hits.set(c.id, {
          contact_id: c.id,
          display_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Unknown",
          email: c.email, phone: c.phone, confidence: "high", via: "email",
        });
      }
    }
  }

  // Phone — high confidence
  if (hits.size === 0) {
    for (const p of t.phones) {
      const { data } = await sb.rpc("crm_match_contact_by_phone", { p_phone: p });
      const rows = (data ?? []) as Array<{ contact_id: string }>;
      for (const r of rows.slice(0, 2)) {
        const { data: c } = await sb.from("crm_contacts")
          .select("id, first_name, last_name, email, phone, deleted_at")
          .eq("id", r.contact_id).is("deleted_at", null).maybeSingle();
        if (!c) continue;
        hits.set(c.id, {
          contact_id: c.id,
          display_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.phone || "Unknown",
          email: c.email, phone: c.phone, confidence: "high", via: "phone",
        });
      }
    }
  }

  // Name — medium/low. Only if no email/phone hits.
  if (hits.size === 0) {
    for (const n of t.names) {
      const parts = n.split(/\s+/);
      const first = parts[0]; const last = parts[1];
      let query = sb.from("crm_contacts")
        .select("id, first_name, last_name, email, phone, deleted_at")
        .is("deleted_at", null);
      if (last) {
        query = query.ilike("first_name", `${first}%`).ilike("last_name", `${last}%`);
      } else {
        query = query.or(`first_name.ilike.${first}%,last_name.ilike.${first}%`);
      }
      const { data } = await query.limit(4);
      for (const c of data ?? []) {
        if (hits.has(c.id)) continue;
        hits.set(c.id, {
          contact_id: c.id,
          display_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unknown",
          email: c.email, phone: c.phone,
          confidence: last ? "medium" : "low", via: "name",
        });
      }
    }
  }

  const arr = Array.from(hits.values());
  // Auto-resolve when: 1 hit, OR exactly 1 high-confidence hit
  const highs = arr.filter((h) => h.confidence === "high");
  if (highs.length === 1) return { resolved: highs[0], candidates: [] };
  if (arr.length === 1 && arr[0].confidence !== "low") return { resolved: arr[0], candidates: [] };
  return { resolved: null, candidates: arr.slice(0, 4) };
}

async function buildLeadMemoryBlock(contactId: string): Promise<{ block: string; payload: any } | null> {
  const sb = svc();
  const [contactRes, memRes, activityRes] = await Promise.all([
    sb.from("crm_contacts")
      .select("id, first_name, last_name, email, phone, status, lead_type, contact_type, language_preference, city, tags, last_touch_at, engagement_score, assigned_to, project, projects")
      .eq("id", contactId).maybeSingle(),
    sb.from("zara_lead_memory")
      .select("summary, signals, facts, relationship_stage, last_topics, continuity_openers, refreshed_at")
      .eq("contact_id", contactId).maybeSingle(),
    sb.from("crm_activity_events")
      .select("type, occurred_at, project_slug, metadata")
      .eq("contact_id", contactId).order("occurred_at", { ascending: false }).limit(3),
  ]);
  const c: any = contactRes.data; if (!c) return null;
  const m: any = memRes.data ?? {};
  const recentActs = (activityRes.data ?? []) as any[];
  const lastAct = recentActs[0];
  const topProjects = [
    ...(c.project ? [c.project] : []),
    ...(Array.isArray(c.projects) ? c.projects : []),
    ...recentActs.map((a) => a.project_slug).filter(Boolean),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i).slice(0, 3);
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Unknown";

  const lines: string[] = [];
  lines.push("<lead_memory>");
  lines.push(`The conversation is about THIS lead. Use this context silently — never recap it back to Uzair unless he asks.`);
  lines.push(`Name: ${name} · id=${c.id}`);
  if (c.email) lines.push(`Email: ${c.email}`);
  if (c.phone) lines.push(`Phone: ${c.phone}`);
  if (c.status) lines.push(`Pipeline: ${c.status}${c.lead_type ? ` · ${c.lead_type}` : ""}`);
  if (c.city) lines.push(`City: ${c.city}`);
  if (c.language_preference) lines.push(`Language: ${c.language_preference}`);
  if (Array.isArray(c.tags) && c.tags.length) lines.push(`Tags: ${c.tags.slice(0, 8).join(", ")}`);
  if (typeof c.engagement_score === "number") lines.push(`Engagement: ${c.engagement_score}/100`);
  if (c.last_touch_at) lines.push(`Last touch: ${c.last_touch_at}`);
  if (m.relationship_stage) lines.push(`Relationship stage: ${m.relationship_stage}`);
  if (Array.isArray(m.last_topics) && m.last_topics.length) lines.push(`Last topics: ${m.last_topics.slice(0, 5).join(" · ")}`);
  if (Array.isArray(m.continuity_openers) && m.continuity_openers.length) {
    lines.push(`Possible openers: ${m.continuity_openers.slice(0, 2).map((s: string) => `"${s}"`).join(" / ")}`);
  }
  if (topProjects.length) lines.push(`Top projects of interest: ${topProjects.join(" · ")}`);
  if (lastAct) lines.push(`Last activity: ${lastAct.type} @ ${lastAct.occurred_at}${lastAct.project_slug ? ` · ${lastAct.project_slug}` : ""}`);
  if (m.summary) lines.push(`Summary: ${String(m.summary).slice(0, 600)}`);
  lines.push("</lead_memory>");

  return {
    block: lines.join("\n"),
    payload: {
      contact_id: c.id,
      display_name: name,
      email: c.email, phone: c.phone, city: c.city,
      status: c.status, lead_type: c.lead_type,
      engagement_score: c.engagement_score,
      relationship_stage: m.relationship_stage ?? null,
      last_touch_at: c.last_touch_at,
      summary: m.summary ?? null,
      last_topics: m.last_topics ?? [],
      continuity_openers: m.continuity_openers ?? [],
      top_projects: topProjects,
      tags: c.tags ?? [],
    },
  };
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { conversation_id, message, page_context, reply_mode } = await req.json();
    if (!conversation_id || !message) return new Response("conversation_id and message required", { status: 400, headers: corsHeaders });

    // Check mode
    const sb = svc();
    const { data: settings } = await sb.from("zara_settings").select("mode,test_phone_numbers").eq("id", 1).maybeSingle();
    const mode = settings?.mode ?? "sandbox";
    if (mode === "off") {
      return new Response("Zara is currently off.", { status: 423, headers: corsHeaders });
    }
    const ctx: ToolCtx & { consulted_sources?: any } = {
      user_id: user.id, conversation_id,
      zara_enabled: true,
      test_phones: settings?.test_phone_numbers ?? [],
    };

    // Persist the user message (with page_context snapshot)
    const pinnedContactId = (page_context && typeof page_context === "object" && (page_context as any).contact_id) || null;
    await sb.from("zara_messages").insert({
      conversation_id, role: "user", content: message,
      page_context: page_context ?? null,
    });
    // Shadow-write to new single-rolling table
    sb.from("zara_chat_messages").insert({
      agent_user_id: user.id,
      role: "user",
      parts: [{ type: "text", text: message }, ...(page_context ? [{ type: "page_context", page_context }] : [])],
      pinned_contact_id: pinnedContactId,
    }).then(() => {}, (e) => console.warn("zara_chat_messages user write failed", e));
    await sb.from("zara_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // Load history + load system prompt addenda
    const history = await loadHistory(conversation_id);
    const { data: addenda } = await sb.from("zara_system_prompt_addenda").select("addendum").eq("active", true);

    // RAG retrieval — embed the user's message and pull top playbook chunks,
    // past wins, project deep-dives, and recent market intel.
    let ragBlock = "";
    let ragSources: any = null;
    let ragWarning: string | null = null;
    if (!OPENAI_API_KEY) {
      ragWarning = "OPENAI_API_KEY not configured — Zara is replying without retrieval grounding. Add the secret under Lovable Cloud settings to enable Zara Brain.";
    } else {
      const r = await retrieveContext(message);
      ragBlock = r.block;
      ragSources = r.sources;
    }

    // ── Lead auto-resolution + memory ────────────────────────────────────
    // Priority: explicit page_context.contact_id > resolver hit from message
    let activeContactId: string | null = pinnedContactId;
    let resolvedPayload: any = null;
    let candidatesPayload: any[] = [];
    if (!activeContactId) {
      const historyText = history.slice(-6).map((r: any) => typeof r.content === "string" ? r.content : "").join("\n");
      const { resolved, candidates } = await resolveLeadFromMessage(message, historyText);
      if (resolved) {
        activeContactId = resolved.contact_id;
        resolvedPayload = resolved;
      } else if (candidates.length > 1) {
        candidatesPayload = candidates;
      }
    }
    let leadMemoryBlock = "";
    let leadMemoryPayload: any = null;
    if (activeContactId) {
      const lm = await buildLeadMemoryBlock(activeContactId);
      if (lm) { leadMemoryBlock = lm.block; leadMemoryPayload = lm.payload; }
    }

    // System assembly: <retrieved_context> goes BEFORE addenda; <current_view>
    // and <lead_memory> go after retrieval so the model can use them to
    // resolve pronouns and ground every draft.
    const currentViewBlock = await buildCurrentViewBlock(page_context);
    const rollingSummaryBlock = await buildRollingSummaryBlock(conversation_id);
    // Learned preferences from past approvals — tone rules, phrasing swaps,
    // CTA verdicts, timing patterns. Compact block, soft-default semantics.
    const { buildLearnedPreferencesBlock } = await import("../_shared/zara-learned-brief.ts");
    const learnedPreferencesBlock = await buildLearnedPreferencesBlock(svc() as any).catch(() => "");

    const systemParts = [SYSTEM_PROMPT_BASE];
    if (learnedPreferencesBlock) systemParts.push(learnedPreferencesBlock);
    if (rollingSummaryBlock) systemParts.push(rollingSummaryBlock);
    if (ragBlock) systemParts.push(ragBlock);
    if (leadMemoryBlock) systemParts.push(leadMemoryBlock);
    if (currentViewBlock) systemParts.push(currentViewBlock);
    for (const a of (addenda ?? [])) systemParts.push((a as any).addendum);

    if (reply_mode === "action") {
      systemParts.push(
        `ACTION-ONLY MODE (strict):
- Output AT MOST one short follow-up question (≤12 words). No greetings, no explanations, no recaps, no markdown headings, no bullet lists in the body.
- Then ALWAYS append a ###NEXT### block with 1–3 click-to-send actions (write-verbs only — Draft, Send, Book, Schedule, Log, Add, Update, Assign, Tag, Create, Remind).
- If you would otherwise return prose, compress it into a single chip in the ###NEXT### block instead.
- Never narrate what you're about to do — just propose the chips.`
      );
    }
    const system = systemParts.join("\n\n");

    // SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sseEvent(event, data)));
        const abort = new AbortController();
        try {
          if (ragWarning) send("warning", { message: ragWarning });
          if (ragSources) send("sources", ragSources);
          if (leadMemoryPayload) send("resolved_lead", { lead: leadMemoryPayload, resolved_via: resolvedPayload?.via ?? "page_context", confidence: resolvedPayload?.confidence ?? "high" });
          else if (candidatesPayload.length) send("lead_candidates", { candidates: candidatesPayload });

          // Auto-title from first user msg
          const userTurns = history.filter((r) => r.role === "user").length;
          if (userTurns === 0) {
            const title = await maybeAutoTitle(conversation_id, message);
            if (title) send("title", { title });
          }

          let messages = toAnthropicMessages([...history, { role: "user", content: message }]);
          let turn = 0;
          let lastAssistantId: string | null = null;
          const toolResultsById = new Map<string, any>();

          while (turn < MAX_TOOL_TURNS) {
            turn++;
            const body = await callAnthropic(messages, system, abort.signal);
            const { text, toolUses, stopReason, usage } = await consumeAnthropicStream(body, (d) => send("text", { delta: d }));

            const assistantContent: any[] = [];
            if (text) assistantContent.push({ type: "text", text });
            for (const tu of toolUses) assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
            const persistSources = turn === 1 ? ragSources : undefined;
            const referencedIds = extractReferencedIds(toolUses, toolResultsById);
            lastAssistantId = await persistAssistantTurn(conversation_id, text, toolUses, usage, persistSources, referencedIds, user.id, pinnedContactId);
            messages.push({ role: "assistant", content: assistantContent });

            if (stopReason !== "tool_use" || toolUses.length === 0) {
              send("done", { message_id: lastAssistantId, usage });
              // Title regen at milestones (non-blocking)
              const newUserTurnCount = userTurns + 1;
              regenerateTitleIfDue(conversation_id, newUserTurnCount).then((t) => {
                if (t) { try { send("title", { title: t }); } catch { /* stream closed */ } }
              }, () => {});
              break;
            }

            const toolResults: any[] = [];
            let anyPending = false;
            for (const tu of toolUses) {
              if (NEEDS_APPROVAL.has(tu.name)) {
                // Hard guard: never queue an empty draft for approval. Force the model to
                // write the actual subject + body using the lead memory it already has.
                const input = (tu.input ?? {}) as any;
                const isMsg = tu.name === "draft_email" || tu.name === "draft_sms" || tu.name === "draft_whatsapp";
                const missing: string[] = [];
                if (isMsg) {
                  if (!input.contact_id) missing.push("contact_id");
                  if (!input.body || String(input.body).trim().length < 20) missing.push("body (write the full message using the lead's note intelligence, recent activity, and project context — no placeholders)");
                  if (tu.name === "draft_email" && (!input.subject || String(input.subject).trim().length < 3)) missing.push("subject");
                }
                if (missing.length > 0) {
                  const out = {
                    ok: false,
                    error: `Draft rejected — missing/empty: ${missing.join(", ")}. Re-call ${tu.name} with the full written message grounded in the lead's note intelligence, recent activity, and conversation history. Do NOT call this tool with empty arguments.`,
                  };
                  await persistToolResult(conversation_id, tu.id, tu.name, out);
                  toolResultsById.set(tu.id, out);
                  toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out), is_error: true });
                  continue;
                }
                const { data: pend } = await sb.from("zara_pending_tool_calls").insert({
                  conversation_id, message_id: lastAssistantId,
                  tool_use_id: tu.id, tool_name: tu.name, tool_input: tu.input,
                  requested_by: user.id, status: "pending",
                }).select("id").single();
                send("tool_pending", { id: tu.id, name: tu.name, input: tu.input, pending_id: pend?.id });
                const out = {
                  ok: false, pending_approval: true, pending_id: pend?.id,
                  message: `Awaiting user approval for ${tu.name}. Briefly tell the user what's being proposed and stop — do not call any more tools until they decide.`,
                };
                await persistToolResult(conversation_id, tu.id, tu.name, out);
                toolResultsById.set(tu.id, out);
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
                anyPending = true;
                continue;
              }
              send("tool_start", { id: tu.id, name: tu.name, input: tu.input });
              // Attach RAG sources to ctx for draft tools so they persist to zara_suggested_replies.consulted_sources
              const callCtx = (tu.name === "draft_email" || tu.name === "draft_sms" || tu.name === "draft_whatsapp") && ragSources
                ? { ...ctx, consulted_sources: ragSources } : ctx;
              const out = await runTool(tu.name, tu.input, callCtx as any);

              // Auto-resolve {LOOKUP: topic} placeholders left in any draft.
              // Fires for draft_email / draft_sms / draft_whatsapp only.
              let lookupReport: { resolved: string[]; unresolved: string[] } | null = null;
              if (DRAFT_TOOLS.has(tu.name) && (out as any)?.ok && (out as any)?.data?.draft_id) {
                try {
                  lookupReport = await autoResolveLookupsInDraft(
                    (out as any).data.draft_id,
                    callCtx as any,
                    runTool,
                  );
                } catch (e) {
                  console.warn("[zara-chat] auto-resolve lookups failed", e);
                }
                if (lookupReport) (out as any).lookup_resolution = lookupReport;
              }

              await persistToolResult(conversation_id, tu.id, tu.name, out);
              toolResultsById.set(tu.id, out);
              send("tool_result", { id: tu.id, name: tu.name, output: out });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
            }
            messages.push({ role: "user", content: toolResults });
            if (anyPending) { /* allow one more summarising turn */ }
          }

          if (turn >= MAX_TOOL_TURNS) {
            send("error", { message: `Stopped after ${MAX_TOOL_TURNS} tool turns.` });
          }
        } catch (e) {
          send("error", { message: String((e as Error).message ?? e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
