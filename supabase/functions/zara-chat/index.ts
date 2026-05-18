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

const NEEDS_APPROVAL = new Set(ZARA_TOOLS.filter((t) => t.needs_approval).map((t) => t.name));

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

async function loadHistory(convId: string) {
  const sb = svc();
  const { data } = await sb.from("zara_messages")
    .select("role,content,tool_calls,tool_call_id,tool_result,tool_name")
    .eq("conversation_id", convId).order("created_at", { ascending: true }).limit(40);
  return data ?? [];
}

// Convert our persisted messages to Anthropic format.
function toAnthropicMessages(rows: any[]) {
  const out: any[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      out.push({ role: "user", content: r.content ?? "" });
    } else if (r.role === "assistant") {
      const content: any[] = [];
      if (r.content) content.push({ type: "text", text: r.content });
      if (Array.isArray(r.tool_calls)) for (const tc of r.tool_calls)
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      out.push({ role: "assistant", content });
    } else if (r.role === "tool") {
      out.push({ role: "user", content: [{ type: "tool_result", tool_use_id: r.tool_call_id, content: JSON.stringify(r.tool_result) }] });
    }
  }
  return out;
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
  const empty = { block: "", sources: { chunks: [], wins: [], projects: [], market: [] } };
  const emb = await embedQuery(userText);
  if (!emb) return empty;
  const sb = svc();
  const [chunkRes, winRes, projRes, marketRes] = await Promise.all([
    sb.rpc("zara_match_knowledge_chunks", { query_embedding: emb as any, match_threshold: RAG_CHUNK_THRESHOLD, match_count: RAG_CHUNK_COUNT }),
    sb.rpc("zara_match_winning_conversations", { query_embedding: emb as any, match_threshold: RAG_WIN_THRESHOLD, match_count: RAG_WIN_COUNT }),
    sb.rpc("zara_match_project_deep_dives", { query_embedding: emb as any, match_threshold: RAG_PROJECT_THRESHOLD, match_count: RAG_PROJECT_COUNT }),
    sb.from("market_intel").select("id,week_of,headline,summary").order("week_of", { ascending: false }).limit(2),
  ]);
  const chunks = (chunkRes.data ?? []) as any[];
  const wins = (winRes.data ?? []) as any[];
  const projects = (projRes.data ?? []) as any[];
  const market = (marketRes.data ?? []) as any[];

  if (!chunks.length && !wins.length && !projects.length && !market.length) return empty;

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
  parts.push("</retrieved_context>");

  return {
    block: parts.join("\n"),
    sources: {
      chunks: chunks.map((c) => ({ id: c.id, document_id: c.document_id, title: c.metadata?.title ?? null, similarity: c.similarity })),
      wins: wins.map((w) => ({ id: w.id, profile: w.lead_profile, similarity: w.similarity })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, city: p.city, similarity: p.similarity })),
      market: market.map((m) => ({ id: m.id, week_of: m.week_of, headline: m.headline })),
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

    // System assembly: <retrieved_context> goes BEFORE addenda; <current_view>
    // goes after retrieval so the model can use it to resolve pronouns.
    const currentViewBlock = await buildCurrentViewBlock(page_context);
    const systemParts = [SYSTEM_PROMPT_BASE];
    if (ragBlock) systemParts.push(ragBlock);
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
