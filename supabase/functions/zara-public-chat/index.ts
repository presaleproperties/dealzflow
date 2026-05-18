// Zara Public Chat — public-facing wrapper around the Zara brain.
// Used by presaleproperties.com (via the site's zara-proxy edge fn) to talk to
// the SAME Zara that agents use inside DealzFlow. One brain, one memory.
//
// Auth: shared secret header `x-presale-site-token` (no JWT).
// Conversation key: `presale_user_id` (anonymous browser id), re-keyed to
// `presale_contact_id` once we resolve them to a CRM contact via known email/phone.
// Persistence: zara_messages + zara_conversations (source='public_site').
//
// SSE event format mirrors zara-chat exactly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZARA_TOOLS } from "../_shared/zara-tool-defs.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const PRESALE_SITE_TOKEN = Deno.env.get("PRESALE_SITE_TOKEN") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_TURNS = 8;
const HISTORY_WINDOW = 80;

// RAG thresholds — mirror zara-chat so the two surfaces ground in the same brain.
const RAG_CHUNK_THRESHOLD = 0.5;
const RAG_CHUNK_COUNT = 4;
const RAG_WIN_THRESHOLD = 0.55;
const RAG_WIN_COUNT = 2;
const RAG_PROJECT_THRESHOLD = 0.55;
const RAG_PROJECT_COUNT = 2;

// Tools that require a captured contact (email or phone on file) BEFORE running.
// If the visitor has not handed over identity yet, we refuse the tool and tell
// Claude to ask for email via capture_lead first.
const REQUIRES_CAPTURE = new Set<string>([
  "send_brochure",
  "attach_floorplan",
  "get_floor_plans",
  "book_calendly",
]);

// Public-mode tool allowlist. Everything else from the 30+ tool set is stripped
// before we hand the tool list to Claude.
const PUBLIC_TOOL_ALLOWLIST = new Set<string>([
  "get_lead_context",
  "list_projects",
  "project_details",
  "recommend_projects_for_lead",
  "attach_floorplan",
  "get_pricing",
  "get_project_deep_dive",
  "book_calendly",
  "search_knowledge",
  "capture_lead",
  "get_unit_availability",
  "escalate_to_human",
  "get_floor_plans",
  "send_brochure",
  "lookup_topic",
]);

// Tools that count toward the outbound-send rate limit (10/hr).
const SEND_TOOLS = new Set<string>(["book_calendly", "attach_floorplan", "escalate_to_human", "send_brochure"]);

const SYSTEM_PROMPT_PUBLIC = `You are speaking to a PUBLIC VISITOR on presaleproperties.com, not to an internal agent.

Rules for public mode:
- Tone: warm, helpful, never pushy. You are Zara from the Presale Properties office in Surrey.
- Goal: understand what they're looking for, recommend matching projects, qualify gently.
- Capture name + email + phone naturally in conversation BEFORE deep recommendations or sending anything by email.
- If they ask for floor plans: prefer get_floor_plans (private signed PDFs, 5-min link) when available, otherwise fall back to attach_floorplan (public link) or project_details. Always confirm their email first.
- If they show high intent (asking about deposits, calling, viewing same project repeatedly) — offer to book a call with Uzair via book_calendly.
- Never quote prices that aren't in our project data. Use get_pricing before quoting numbers.
- Never expose internal CRM details (deal stage, agent notes, commission, other leads). You are aware of them but never mention them.
- Use the page_context block to ground answers. If they're on a project page, assume that's the project they care about unless they say otherwise.
- Keep responses tight, scannable, friendly.`;

const SYSTEM_PROMPT_BASE = `You are Zara from The Presale Properties Group — the intelligent relationship manager working alongside Uzair Muhammad and the team. The Presale Properties Group exclusively represents BUYERS for new construction presale condos, townhomes, and detached homes in Metro Vancouver / Fraser Valley. You are NOT a chatbot, AI assistant, digital concierge, virtual assistant, or automation system — never describe yourself that way. If a visitor asks "are you a bot / real?", respond honestly and simply: "I'm Zara, I work on Uzair's team at The Presale Properties Group. I handle the conversations and Uzair jumps in personally when things get serious."

- Open like you're continuing an existing conversation — the visitor already knows why they're on the site. Never recite company overview, services, or capabilities.
- Tone: warm, calm, premium, low-pressure, human. Short replies, one contextual question at a time.
- Prefer real data via tools over guessing. If you don't know, call a tool.
- For projects, prefer recommend_projects_for_lead when a contact context exists.
- A <current_view> block tells you what the visitor is looking at right now. Resolve pronouns to it.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-presale-site-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errJson(error: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, message, ...extra }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function svc() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}
function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
function safeJson(s: string) { try { return JSON.parse(s); } catch { return {}; } }

type Identity = { contact_id: string | null };

async function resolveIdentity(presale_user_id: string, known_email?: string | null, known_phone?: string | null): Promise<Identity> {
  const sb = svc();
  let contact_id: string | null = null;
  if (known_email || known_phone) {
    const { data } = await sb.rpc("crm_resolve_contact_identity", {
      _email: known_email ?? null,
      _phone: known_phone ?? null,
    });
    if (data) contact_id = data as string;
  }
  return { contact_id };
}

async function getOrCreateConversation(presale_user_id: string, contact_id: string | null): Promise<string> {
  const sb = svc();
  // Prefer a conversation already tied to the contact, else fall back to the
  // anonymous one for this browser, else create a new one.
  if (contact_id) {
    const { data: byContact } = await sb.from("zara_conversations")
      .select("id, presale_user_id")
      .eq("presale_contact_id", contact_id)
      .eq("source", "public_site")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    if (byContact?.id) {
      // Re-key the anonymous browser thread to the contact if not already.
      if (byContact.presale_user_id !== presale_user_id) {
        await sb.from("zara_conversations").update({ presale_user_id }).eq("id", byContact.id);
      }
      return byContact.id;
    }
  }
  const { data: byAnon } = await sb.from("zara_conversations")
    .select("id, presale_contact_id")
    .eq("presale_user_id", presale_user_id)
    .eq("source", "public_site")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  if (byAnon?.id) {
    if (contact_id && !byAnon.presale_contact_id) {
      await sb.from("zara_conversations").update({ presale_contact_id: contact_id }).eq("id", byAnon.id);
    }
    return byAnon.id;
  }
  const { data: created, error } = await sb.from("zara_conversations").insert({
    user_id: null,
    presale_user_id,
    presale_contact_id: contact_id,
    source: "public_site",
    title: "Website visitor",
    last_message_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !created) throw new Error(`conversation create failed: ${error?.message}`);
  return created.id;
}

async function loadHistory(convId: string) {
  const sb = svc();
  const { data } = await sb.from("zara_messages")
    .select("role,content,tool_calls,tool_call_id,tool_result,tool_name,created_at")
    .eq("conversation_id", convId).order("created_at", { ascending: false }).limit(HISTORY_WINDOW);
  return (data ?? []).reverse();
}

// ── Brain parity: RAG retrieval (same shape as zara-chat) ────────────
async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch { return null; }
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
    sb.rpc("zara_founder_retrieve", { _query: userText, _module_slug: null, _limit: 4 }).then((r: any) => r, () => ({ data: [] })),
  ]);
  const chunks = (chunkRes.data ?? []) as any[];
  const wins = (winRes.data ?? []) as any[];
  const projects = (projRes.data ?? []) as any[];
  const market = (marketRes.data ?? []) as any[];
  const principles = (principlesRes.data ?? []) as any[];
  if (!chunks.length && !wins.length && !projects.length && !market.length && !principles.length) return empty;

  const parts: string[] = ["<retrieved_context>"];
  parts.push("Grounding from Uzair's playbooks and project notes. Use silently — never quote source ids back to the visitor.");
  if (chunks.length) { parts.push("\n## Playbook\n"); chunks.forEach((c, i) => parts.push(`[K${i+1}] ${String(c.content).slice(0, 700)}`)); }
  if (wins.length) { parts.push("\n## Past wins\n"); wins.forEach((w, i) => parts.push(`[W${i+1}] ${w.lead_profile ?? "?"} — turning: ${w.turning_message ?? "?"}`)); }
  if (projects.length) { parts.push("\n## Project deep-dives\n"); projects.forEach((p, i) => parts.push(`[P${i+1}] ${p.name}${p.city ? ` (${p.city})` : ""} — ${String(p.uzair_pitch ?? "").slice(0, 300)}`)); }
  if (market.length) { parts.push("\n## Market\n"); market.forEach((m, i) => parts.push(`[M${i+1}] ${m.week_of}: ${m.headline ?? ""}`)); }
  if (principles.length) { parts.push("\n## Founder principles\n"); principles.forEach((p: any, i) => parts.push(`[F${i+1}] ${p.title ?? ""} — ${String(p.body ?? "").slice(0, 280)}`)); }
  parts.push("</retrieved_context>");

  return {
    block: parts.join("\n"),
    sources: {
      chunks: chunks.map((c) => ({ id: c.id, document_id: c.document_id, similarity: c.similarity })),
      wins: wins.map((w) => ({ id: w.id, similarity: w.similarity })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, similarity: p.similarity })),
      market: market.map((m) => ({ id: m.id, week_of: m.week_of })),
      principles: principles.map((p: any) => ({ id: p.id, title: p.title })),
    },
  };
}

async function buildLeadMemoryBlock(contactId: string): Promise<string> {
  const sb = svc();
  const [contactRes, memRes] = await Promise.all([
    sb.from("crm_contacts")
      .select("id, first_name, last_name, email, phone, status, language_preference, city, tags, project, projects")
      .eq("id", contactId).maybeSingle(),
    sb.from("zara_lead_memory")
      .select("summary, relationship_stage, last_topics, continuity_openers")
      .eq("contact_id", contactId).maybeSingle(),
  ]);
  const c: any = contactRes.data; if (!c) return "";
  const m: any = memRes.data ?? {};
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Visitor";
  const lines = ["<lead_memory>"];
  lines.push("This visitor is already a known CRM contact. Use silently for continuity. Never recap CRM internals.");
  lines.push(`Name: ${name}`);
  if (c.language_preference) lines.push(`Language: ${c.language_preference}`);
  if (c.city) lines.push(`City: ${c.city}`);
  if (Array.isArray(c.tags) && c.tags.length) lines.push(`Tags: ${c.tags.slice(0, 6).join(", ")}`);
  const projs = [...(c.project ? [c.project] : []), ...(Array.isArray(c.projects) ? c.projects : [])].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3);
  if (projs.length) lines.push(`Projects of interest: ${projs.join(" · ")}`);
  if (m.relationship_stage) lines.push(`Relationship stage: ${m.relationship_stage}`);
  if (Array.isArray(m.last_topics) && m.last_topics.length) lines.push(`Last topics: ${m.last_topics.slice(0, 4).join(" · ")}`);
  if (Array.isArray(m.continuity_openers) && m.continuity_openers.length) {
    lines.push(`Possible openers: ${m.continuity_openers.slice(0, 2).map((s: string) => `"${s}"`).join(" / ")}`);
  }
  if (m.summary) lines.push(`Summary: ${String(m.summary).slice(0, 400)}`);
  lines.push("</lead_memory>");
  return lines.join("\n");
}

function toAnthropicMessages(rows: any[]) {
  const out: any[] = [];
  for (const r of rows) {
    if (r.role === "user") out.push({ role: "user", content: r.content ?? "" });
    else if (r.role === "assistant") {
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

async function runTool(name: string, input: unknown, ctx: { conversation_id: string; contact_id: string | null }) {
  // Public mode never has an agent user_id. We pass a synthetic ctx — the
  // sensitive write tools are stripped from the allowlist anyway.
  const res = await fetch(`${FUNCTIONS_BASE}/zara-tool-execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({
      tool: name,
      args: input,
      ctx: {
        user_id: null,
        conversation_id: ctx.conversation_id,
        zara_enabled: false, // disables any send paths inside read-shaped tools
        test_phones: [],
        public_mode: true,
        public_contact_id: ctx.contact_id,
      },
    }),
  });
  return await res.json();
}

async function callAnthropic(messages: any[], system: string, tools: any[], signal: AbortSignal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1536,
      stream: true,
      system,
      tools,
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

async function consumeAnthropicStream(stream: ReadableStream<Uint8Array>, onText: (d: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const blocks: any[] = [];
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
            if (obj.delta.type === "text_delta") { b.text += obj.delta.text; text += obj.delta.text; onText(obj.delta.text); }
            else if (obj.delta.type === "input_json_delta") b.inputJson += obj.delta.partial_json;
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

async function buildCurrentViewBlock(pc: any, contact_id: string | null): Promise<string> {
  if (!pc && !contact_id) return "";
  const lines: string[] = ["<current_view>"];
  lines.push(`Surface: public_site`);
  if (pc?.url) lines.push(`URL: ${pc.url}`);
  if (pc?.project_slug) lines.push(`Viewing project: ${pc.project_slug}`);
  if (Array.isArray(pc?.recently_viewed) && pc.recently_viewed.length) {
    lines.push(`Recently viewed: ${pc.recently_viewed.slice(0, 6).join(", ")}`);
  }
  if (pc?.lifecycle_stage) lines.push(`Lifecycle: ${pc.lifecycle_stage}`);
  if (contact_id) lines.push(`Resolved CRM contact: ${contact_id}`);
  lines.push("</current_view>");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Token gate
    const presented = req.headers.get("x-presale-site-token") ?? "";
    if (!PRESALE_SITE_TOKEN || presented !== PRESALE_SITE_TOKEN) {
      return errJson("unauthorized", "Missing or invalid x-presale-site-token header.", 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0 || !body.presale_user_id) {
      return errJson("bad_request", "messages[] and presale_user_id are required.", 400);
    }

    // Truncate to last 50 turns
    if (body.messages.length > 50) body.messages = body.messages.slice(-50);

    const presale_user_id: string = String(body.presale_user_id).slice(0, 128);
    const known_email: string | null = body.known_email ? String(body.known_email).slice(0, 256) : null;
    const known_phone: string | null = body.known_phone ? String(body.known_phone).slice(0, 64) : null;
    const page_context = body.page_context ?? null;
    const latestUserMsgRaw = String(body.messages[body.messages.length - 1]?.content ?? "");
    if (!latestUserMsgRaw) {
      return errJson("empty_message", "Latest user message is empty.", 400);
    }
    if (latestUserMsgRaw.length > 4000) {
      return errJson("message_too_long", "Messages must be 4000 characters or fewer.", 413);
    }
    const latestUserMsg = latestUserMsgRaw;

    // Rate limit (message side) — 60 msg / hr per presale_user_id
    const sb = svc();
    const { data: rl } = await sb.rpc("zara_public_rate_check", {
      _presale_user_id: presale_user_id, _is_send: false, _msg_limit: 60, _send_limit: 10,
    });
    const rlRow = Array.isArray(rl) ? rl[0] : rl;
    if (rlRow && rlRow.allowed === false) {
      return errJson("rate_limited", "Too many messages — slow down.", 429, {
        retry_after_seconds: rlRow.retry_after_seconds,
      });
    }

    // Resolve identity → conversation
    const ident = await resolveIdentity(presale_user_id, known_email, known_phone);
    const conversation_id = await getOrCreateConversation(presale_user_id, ident.contact_id);

    // Persist visitor message
    await sb.from("zara_messages").insert({
      conversation_id, role: "user", content: latestUserMsg,
      page_context: page_context ?? null,
    });
    await sb.from("zara_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // Build system — same brain as zara-chat: RAG + lead memory + current view.
    const [cv, rag, leadMemoryBlock] = await Promise.all([
      buildCurrentViewBlock(page_context, ident.contact_id),
      retrieveContext(latestUserMsg),
      ident.contact_id ? buildLeadMemoryBlock(ident.contact_id) : Promise.resolve(""),
    ]);
    const systemParts = [SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_PUBLIC];
    if (rag.block) systemParts.push(rag.block);
    if (leadMemoryBlock) systemParts.push(leadMemoryBlock);
    if (cv) systemParts.push(cv);
    const system = systemParts.join("\n\n");
    const ragSources = rag.sources;

    // Capture state — for gating PII/file-sharing tools.
    const hasCapturedIdentity = !!(ident.contact_id || known_email || known_phone);

    // Tool list: allowlisted only, approval-required tools stripped.
    const tools = ZARA_TOOLS
      .filter((t) => PUBLIC_TOOL_ALLOWLIST.has(t.name) && !t.needs_approval)
      .map(({ name, description, input_schema }) => ({ name, description, input_schema }));

    const history = await loadHistory(conversation_id);
    let messages = toAnthropicMessages([...history, { role: "user", content: latestUserMsg }]);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sse(event, data)));
        const abort = new AbortController();
        try {
          let turn = 0;
          let lastAssistantId: string | null = null;
          while (turn < MAX_TOOL_TURNS) {
            turn++;
            const body = await callAnthropic(messages, system, tools, abort.signal);
            const { text, toolUses, stopReason, usage } = await consumeAnthropicStream(body, (d) => send("text", { delta: d }));

            const assistantContent: any[] = [];
            if (text) assistantContent.push({ type: "text", text });
            for (const tu of toolUses) assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });

            const { data: ins } = await sb.from("zara_messages").insert({
              conversation_id, role: "assistant",
              content: text || null,
              tool_calls: toolUses.length ? toolUses : null,
              input_tokens: usage?.input_tokens ?? null,
              output_tokens: usage?.output_tokens ?? null,
              model: ANTHROPIC_MODEL,
            }).select("id").single();
            lastAssistantId = ins?.id ?? null;
            messages.push({ role: "assistant", content: assistantContent });

            if (stopReason !== "tool_use" || toolUses.length === 0) {
              send("done", { message_id: lastAssistantId, usage });
              break;
            }

            const toolResults: any[] = [];
            for (const tu of toolUses) {
              if (!PUBLIC_TOOL_ALLOWLIST.has(tu.name)) {
                const blocked = { ok: false, error: "tool_not_available_in_public_mode" };
                send("tool_result", { id: tu.id, name: tu.name, output: blocked });
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(blocked) });
                continue;
              }
              // Send-side rate limit for outbound tools
              if (SEND_TOOLS.has(tu.name)) {
                const { data: rl2 } = await sb.rpc("zara_public_rate_check", {
                  _presale_user_id: presale_user_id, _is_send: true, _msg_limit: 60, _send_limit: 10,
                });
                const row = Array.isArray(rl2) ? rl2[0] : rl2;
                if (row && row.allowed === false) {
                  const out = { ok: false, error: "send_rate_limited", retry_after_seconds: row.retry_after_seconds };
                  send("tool_result", { id: tu.id, name: tu.name, output: out });
                  toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
                  continue;
                }
              }
              send("tool_start", { id: tu.id, name: tu.name, input: tu.input });
              const out = await runTool(tu.name, tu.input, { conversation_id, contact_id: ident.contact_id });
              await sb.from("zara_messages").insert({
                conversation_id, role: "tool",
                tool_call_id: tu.id, tool_name: tu.name, tool_result: out,
              });
              send("tool_result", { id: tu.id, name: tu.name, output: out });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
            }
            messages.push({ role: "user", content: toolResults });
          }
          if (turn >= MAX_TOOL_TURNS) send("error", { message: `stopped_after_${MAX_TOOL_TURNS}_tool_turns` });
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
    return errJson("server_error", String((e as Error).message ?? e), 500);
  }
});
