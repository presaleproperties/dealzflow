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
const PRESALE_SITE_TOKEN = Deno.env.get("PRESALE_SITE_TOKEN") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_TURNS = 6;

// Public-mode tool allowlist. Everything else from the 30+ tool set is stripped
// before we hand the tool list to Claude (we never rely on the approval flow
// to keep public visitors safe — they cannot approve anything anyway).
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
]);

// Tools that count toward the outbound-send rate limit (10/hr).
const SEND_TOOLS = new Set<string>(["book_calendly", "attach_floorplan", "escalate_to_human"]);

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

const SYSTEM_PROMPT_BASE = `You are Zara, an AI assistant for Presale Properties (presaleproperties.com), a Greater Vancouver / Fraser Valley presale real-estate brokerage led by Uzair Muhammad.

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
    .select("role,content,tool_calls,tool_call_id,tool_result,tool_name")
    .eq("conversation_id", convId).order("created_at", { ascending: true }).limit(30);
  return data ?? [];
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
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0 || !body.presale_user_id) {
      return new Response(JSON.stringify({ error: "messages[] and presale_user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const presale_user_id: string = String(body.presale_user_id).slice(0, 128);
    const known_email: string | null = body.known_email ? String(body.known_email).slice(0, 256) : null;
    const known_phone: string | null = body.known_phone ? String(body.known_phone).slice(0, 64) : null;
    const page_context = body.page_context ?? null;
    const latestUserMsg = String(body.messages[body.messages.length - 1]?.content ?? "").slice(0, 8000);
    if (!latestUserMsg) {
      return new Response(JSON.stringify({ error: "empty message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit (message side)
    const sb = svc();
    const { data: rl } = await sb.rpc("zara_public_rate_check", {
      _presale_user_id: presale_user_id, _is_send: false, _msg_limit: 30, _send_limit: 10,
    });
    const rlRow = Array.isArray(rl) ? rl[0] : rl;
    if (rlRow && rlRow.allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after_seconds: rlRow.retry_after_seconds }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Build system
    const cv = await buildCurrentViewBlock(page_context, ident.contact_id);
    const system = [SYSTEM_PROMPT_BASE, SYSTEM_PROMPT_PUBLIC, cv].filter(Boolean).join("\n\n");

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
                  _presale_user_id: presale_user_id, _is_send: true, _msg_limit: 30, _send_limit: 10,
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
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
