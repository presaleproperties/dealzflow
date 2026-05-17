// Zara chat — Anthropic Claude streaming with tool-use loop.
// SSE event types emitted to the client:
//   event: text         data: { delta: string }
//   event: tool_start   data: { id, name, input }
//   event: tool_result  data: { id, name, output }
//   event: title        data: { title }
//   event: done         data: { message_id, usage }
//   event: error        data: { message }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ZARA_TOOLS } from "../_shared/zara-tool-defs.ts";

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

const SYSTEM_PROMPT_BASE = `You are Zara, an AI sales assistant for a real-estate CRM (PresaleProperties.com).
You help the agent triage leads, draft outreach, and recommend projects.

Rules:
- You DRAFT outbound messages; the agent approves before send.
- Mutations to lead data require confirmation: when calling update_lead, return the proposed patch in your reply and only call confirm_update_lead after the user agrees.
- Prefer real data via tools over guessing. If you don't know, call a tool.
- When the user names a lead, call get_lead_context first.
- Keep responses tight, scannable, markdown-formatted.
- For projects, prefer recommend_projects_for_lead when a lead context exists.`;

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

async function persistAssistantTurn(convId: string, text: string, toolCalls: any[], usage: any) {
  const sb = svc();
  const { data, error } = await sb.from("zara_messages").insert({
    conversation_id: convId, role: "assistant",
    content: text || null,
    tool_calls: toolCalls.length ? toolCalls : null,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    model: ANTHROPIC_MODEL,
  }).select("id").single();
  if (error) console.error("persist assistant", error);
  return data?.id ?? null;
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
  await sb.from("zara_conversations").update({ title, last_message_at: new Date().toISOString() }).eq("id", convId);
  return title;
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

    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message) return new Response("conversation_id and message required", { status: 400, headers: corsHeaders });

    // Check mode
    const sb = svc();
    const { data: settings } = await sb.from("zara_settings").select("mode,test_phone_numbers").eq("id", 1).maybeSingle();
    const mode = settings?.mode ?? "sandbox";
    if (mode === "off") {
      return new Response("Zara is currently off.", { status: 423, headers: corsHeaders });
    }
    const ctx: ToolCtx = {
      user_id: user.id, conversation_id,
      zara_enabled: true, // Per-contact gate checked inside draft tools
      test_phones: settings?.test_phone_numbers ?? [],
    };

    // Persist the user message
    await sb.from("zara_messages").insert({ conversation_id, role: "user", content: message });
    await sb.from("zara_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);

    // Load history + load system prompt addenda
    const history = await loadHistory(conversation_id);
    const { data: addenda } = await sb.from("zara_system_prompt_addenda").select("content").eq("active", true);
    const system = [SYSTEM_PROMPT_BASE, ...(addenda?.map((a: any) => a.content) ?? [])].join("\n\n");

    // SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sseEvent(event, data)));
        const abort = new AbortController();
        try {
          // Auto-title from first user msg
          const userTurns = history.filter((r) => r.role === "user").length;
          if (userTurns === 0) {
            const title = await maybeAutoTitle(conversation_id, message);
            if (title) send("title", { title });
          }

          let messages = toAnthropicMessages([...history, { role: "user", content: message }]);
          let turn = 0;
          let lastAssistantId: string | null = null;

          while (turn < MAX_TOOL_TURNS) {
            turn++;
            const body = await callAnthropic(messages, system, abort.signal);
            const { text, toolUses, stopReason, usage } = await consumeAnthropicStream(body, (d) => send("text", { delta: d }));

            const assistantContent: any[] = [];
            if (text) assistantContent.push({ type: "text", text });
            for (const tu of toolUses) assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
            lastAssistantId = await persistAssistantTurn(conversation_id, text, toolUses, usage);
            messages.push({ role: "assistant", content: assistantContent });

            if (stopReason !== "tool_use" || toolUses.length === 0) {
              send("done", { message_id: lastAssistantId, usage });
              break;
            }

            // Execute each tool sequentially, emit start + result
            const toolResults: any[] = [];
            for (const tu of toolUses) {
              send("tool_start", { id: tu.id, name: tu.name, input: tu.input });
              const out = await runTool(tu.name, tu.input, ctx);
              await persistToolResult(conversation_id, tu.id, tu.name, out);
              send("tool_result", { id: tu.id, name: tu.name, output: out });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
            }
            messages.push({ role: "user", content: toolResults });
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
