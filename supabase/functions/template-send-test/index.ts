// Send a test render of a draft/saved template to the caller (or a custom
// address). Wraps signature/banner via bridge-send-email and records the
// attempt in crm_template_sync_log so the editor "Sync history" surfaces it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  template_id?: string | null;
  to?: string | null; // optional override; defaults to caller email
  subject: string;
  html: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userResp, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userResp?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userResp.user.id;

    const body = (await req.json()) as Body;
    if (!body?.subject || !body?.html) {
      return json({ error: "subject and html are required" }, 400);
    }

    // Resolve caller's email (from crm_team, fallback to auth user email)
    const { data: teamRow } = await supabase
      .from("crm_team")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    const callerEmail =
      (body.to && body.to.trim()) ||
      teamRow?.email ||
      userResp.user.email ||
      null;
    if (!callerEmail) return json({ error: "No destination email" }, 400);

    // Forward to bridge-send-email which already handles
    // agent-Gmail-vs-bridge identity rules + tracking pixel + brand banner.
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/bridge-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({
        to: callerEmail,
        subject: `[TEST] ${body.subject}`,
        html: body.html,
        template_id: body.template_id ?? null,
        // No contact_id — we don't want this in the lead inbox or activity feed.
      }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));

    // Log the attempt regardless of success.
    if (body.template_id) {
      await supabase.from("crm_template_sync_log").insert({
        template_id: body.template_id,
        direction: "test",
        status: sendRes.ok ? "success" : "error",
        bridge_endpoint: "bridge-send-email",
        payload_summary: { to: callerEmail, subject: body.subject },
        error: sendRes.ok ? null : (sendJson?.error ?? `HTTP ${sendRes.status}`),
        actor_id: userId,
      });
    }

    if (!sendRes.ok) {
      return json({ error: sendJson?.error ?? "Send failed", to: callerEmail }, 502);
    }
    return json({ success: true, to: callerEmail, ...sendJson }, 200);
  } catch (e) {
    console.error("template-send-test error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
