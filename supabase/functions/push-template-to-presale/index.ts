// Pushes a single CRM template change to the Presale Properties bridge.
// Sends create/update payloads (full template) or a soft-delete signal.
// Idempotent on Presale's side via `external_id` + `sync_hash`.
//
// Auth: caller must be a CRM team member. Caller's slug is forwarded so
// Presale can verify ownership of agent-scoped templates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BRIDGE_URL =
  Deno.env.get("PRESALE_BRIDGE_URL") ??
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";
const BRIDGE_SECRET =
  Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET") ?? "";
const PRESALE_ANON = Deno.env.get("PRESALE_ANON_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashContent(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supaUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: member } = await admin
      .from("crm_team")
      .select("user_id, slug, role")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);
    const callerSlug: string | null = member.slug ?? null;
    const isAdmin = member.role === "owner" || member.role === "admin";

    if (!BRIDGE_SECRET || !PRESALE_ANON) {
      // Bridge not configured — push is a no-op so local edits don't fail.
      return json({ ok: true, skipped: "bridge_not_configured" });
    }

    let body: { template_id?: string; external_id?: string; deleted?: boolean };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    // --- Soft-delete path ---
    if (body.deleted && body.external_id) {
      const upstream = await fetch(`${BRIDGE_URL}/bridge-receive-template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": BRIDGE_SECRET,
          "Authorization": `Bearer ${PRESALE_ANON}`,
          "apikey": PRESALE_ANON,
        },
        body: JSON.stringify({
          external_id: body.external_id,
          deleted: true,
          actor_agent_slug: callerSlug,
        }),
      });
      const text = await upstream.text();
      if (!upstream.ok) return json({ error: "upstream_error", status: upstream.status, body: text.slice(0, 300) }, 502);
      return json({ ok: true, action: "soft_deleted" });
    }

    // --- Create/Update path: load the template from our DB ---
    if (!body.template_id) return json({ error: "template_id_required" }, 400);

    const { data: tpl, error: loadErr } = await admin
      .from("crm_email_templates")
      .select("id, slug, external_id, name, subject, body_html, category, project, merge_tags, owner_scope, owner_agent_slug, created_by_agent_slug, sync_hash")
      .eq("id", body.template_id)
      .maybeSingle();
    if (loadErr || !tpl) return json({ error: "template_not_found" }, 404);

    const incomingHash = await hashContent(`${tpl.subject}|${tpl.body_html ?? ""}`);

    // Loop guard — if hash didn't change, no point pushing (Presale would dedupe anyway,
    // but skipping the network round-trip keeps things tidy).
    if (tpl.sync_hash === incomingHash) {
      return json({ ok: true, action: "unchanged" });
    }

    const payload = {
      external_id: tpl.external_id ?? tpl.slug ?? tpl.id,
      slug: tpl.slug ?? tpl.external_id ?? tpl.id,
      name: tpl.name,
      subject: tpl.subject,
      body_html: tpl.body_html ?? "",
      category: tpl.category,
      project: tpl.project,
      merge_tags: tpl.merge_tags ?? [],
      owner_scope: tpl.owner_scope,
      owner_agent_slug: tpl.owner_agent_slug,
      created_by_agent_slug: tpl.created_by_agent_slug,
      sync_hash: incomingHash,
      actor_agent_slug: callerSlug,
    };

    const upstream = await fetch(`${BRIDGE_URL}/bridge-receive-template`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": BRIDGE_SECRET,
        "Authorization": `Bearer ${PRESALE_ANON}`,
        "apikey": PRESALE_ANON,
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return json({ error: "upstream_error", status: upstream.status, body: text.slice(0, 300) }, 502);
    }

    // Cache the hash so subsequent identical pushes are skipped.
    await admin.from("crm_email_templates")
      .update({ sync_hash: incomingHash, last_synced_at: new Date().toISOString() })
      .eq("id", tpl.id);

    return json({ ok: true, action: "pushed" });
  } catch (e) {
    console.error("[push-template-to-presale]", e);
    return json({ error: String(e) }, 500);
  }
});
