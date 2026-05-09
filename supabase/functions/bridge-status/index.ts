// Admin-only diagnostic proxy for the Presale Properties bridge.
// Frontend calls this with a logged-in user's JWT; we verify the user is
// an admin in `user_roles`, then proxy to the requested bridge endpoint
// using the shared secret (which never leaves the edge runtime).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge, PresaleBridgeError } from "../_shared/presale-bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action =
  | "search-projects"
  | "get-project"
  | "list-neighborhoods"
  | "list-developers"
  | "list-agents"
  | "get-agent"
  | "get-lead-behavior"
  | "render-email"
  | "run-all";

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function runOne(
  action: Exclude<Action, "run-all">,
  params: Record<string, string | undefined>,
) {
  const start = Date.now();
  try {
    let result: unknown;
    switch (action) {
      case "search-projects":
        result = await presaleBridge.searchProjects(params.q ?? "");
        break;
      case "get-project":
        result = await presaleBridge.getProject(params.slug ?? "");
        break;
      case "list-neighborhoods":
        result = await presaleBridge.listNeighborhoods();
        break;
      case "list-developers":
        result = await presaleBridge.listDevelopers();
        break;
      case "list-agents":
        result = await presaleBridge.listAgents();
        break;
      case "get-agent":
        result = await presaleBridge.getAgent(params.agentSlug ?? params.slug ?? "");
        break;
      case "get-lead-behavior":
        result = await presaleBridge.getLeadBehavior({
          email: params.email,
          phone: params.phone,
        });
        break;
      case "render-email":
        result = await presaleBridge.renderEmail({
          projectSlug: params.projectSlug ?? "",
          agentSlug: params.agentSlug ?? "",
          templateStyle: params.templateStyle ?? "modern",
          leadName: params.leadName,
        });
        break;
    }
    return { action, ok: true, status: 200, ms: Date.now() - start, sample: truncate(result) };
  } catch (e) {
    const err = e as PresaleBridgeError | Error;
    const status = (err as PresaleBridgeError).status ?? 500;
    return {
      action,
      ok: false,
      status,
      ms: Date.now() - start,
      error: err.message,
      sample: (err as PresaleBridgeError).body
        ? truncate((err as PresaleBridgeError).body)
        : null,
    };
  }
}

function truncate(value: unknown, max = 4000): unknown {
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return value;
    return { _truncated: true, preview: s.slice(0, max) + "…" };
  } catch {
    return String(value);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Allow service-role / cron probe via x-cron-secret header (no JWT).
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronHeader = req.headers.get("x-cron-secret");
  const isCronProbe = !!cronSecret && cronHeader === cronSecret;

  if (!isCronProbe) {
    const authHeader = req.headers.get("Authorization");
    const admin = await isAdmin(authHeader);
    if (!admin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: { action?: Action; params?: Record<string, string | undefined> } = {};
  try {
    body = await req.json();
  } catch { /* allow empty */ }

  const action = body.action ?? "run-all";
  const params = body.params ?? {};

  if (action === "_env-probe") {
    const mask = (v: string | undefined) => {
      if (!v) return { present: false };
      return {
        present: true,
        length: v.length,
        first6: v.slice(0, 6),
        last6: v.slice(-6),
        hasWhitespace: /\s/.test(v),
        hasNewline: /[\r\n]/.test(v),
      };
    };
    return new Response(JSON.stringify({
      PRESALE_BRIDGE_URL: mask(Deno.env.get("PRESALE_BRIDGE_URL")),
      PRESALE_ANON_KEY: mask(Deno.env.get("PRESALE_ANON_KEY")),
      PRESALE_BRIDGE_SECRET: mask(Deno.env.get("PRESALE_BRIDGE_SECRET")),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "run-all") {
    const actions: Exclude<Action, "run-all">[] = [
      "search-projects",
      "get-project",
      "list-neighborhoods",
      "list-developers",
      "list-agents",
      "get-agent",
      "get-lead-behavior",
      "render-email",
    ];
    const results = await Promise.all(actions.map((a) => runOne(a, params)));
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await runOne(action as Exclude<Action, "run-all">, params);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
