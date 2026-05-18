// Approve or deny a pending Zara tool call.
// POST { pending_id: string, decision: 'approve' | 'deny' }
// On approve: runs the underlying tool via zara-tool-execute (service role) and
// persists the result as a follow-up tool message in zara_messages so the next
// chat turn picks it up. Returns { ok, status, result }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { pending_id, decision, overrides } = await req.json();
    if (!pending_id || !["approve", "deny"].includes(decision)) {
      return new Response(JSON.stringify({ error: "pending_id and decision required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error: fetchErr } = await svc
      .from("zara_pending_tool_calls").select("*").eq("id", pending_id).maybeSingle();
    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: "pending tool call not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (row.requested_by !== user.id) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
    if (row.status !== "pending") {
      return new Response(JSON.stringify({ ok: true, status: row.status, result: row.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await svc.from("zara_pending_tool_calls").update({ status: "expired", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", pending_id);
      return new Response(JSON.stringify({ ok: false, status: "expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (decision === "deny") {
      const result = { ok: false, denied: true, message: "User denied this action." };
      await svc.from("zara_pending_tool_calls").update({
        status: "denied", result, decided_by: user.id, decided_at: new Date().toISOString(),
      }).eq("id", pending_id);
      await svc.from("zara_messages").insert({
        conversation_id: row.conversation_id, role: "tool",
        tool_call_id: row.tool_use_id, tool_name: row.tool_name, tool_result: result,
      });
      return new Response(JSON.stringify({ ok: true, status: "denied", result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approve → execute tool. Merge user-edited overrides (subject/body/cta) for draft tools.
    const DRAFT_TOOLS = new Set(["draft_email", "draft_sms", "draft_whatsapp"]);
    const ALLOWED_OVERRIDE_KEYS = new Set(["subject", "body", "cta_text", "cta_url"]);
    let mergedInput = row.tool_input ?? {};
    let edited = false;
    if (overrides && typeof overrides === "object" && DRAFT_TOOLS.has(row.tool_name)) {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (!ALLOWED_OVERRIDE_KEYS.has(k)) continue;
        if (typeof v !== "string") continue;
        const trimmed = v.trim();
        if (trimmed.length === 0) continue;
        if (k === "subject" && trimmed.length > 300) continue;
        if (k === "body" && trimmed.length > 20000) continue;
        if ((k === "cta_text" || k === "cta_url") && trimmed.length > 500) continue;
        clean[k] = v;
      }
      if (Object.keys(clean).length > 0) {
        mergedInput = { ...mergedInput, ...clean };
        edited = true;
      }
    }

    const ctx = { user_id: user.id, conversation_id: row.conversation_id, zara_enabled: true, test_phones: [] };
    const execResp = await fetch(`${FUNCTIONS_BASE}/zara-tool-execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ tool: row.tool_name, args: mergedInput, ctx }),
    });
    const result = await execResp.json();

    await svc.from("zara_pending_tool_calls").update({
      status: "approved", result,
      tool_input: edited ? mergedInput : row.tool_input,
      decided_by: user.id, decided_at: new Date().toISOString(),
    }).eq("id", pending_id);
    await svc.from("zara_messages").insert({
      conversation_id: row.conversation_id, role: "tool",
      tool_call_id: row.tool_use_id, tool_name: row.tool_name,
      tool_result: edited ? { ...result, _edited_by_user: true } : result,
    });

    return new Response(JSON.stringify({ ok: true, status: "approved", result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("zara-tool-approve fatal", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
