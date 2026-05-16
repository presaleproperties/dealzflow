// Pull the live template list from Presale Properties (via bridge-templates)
// and upsert each one into crm_email_templates. Mirrors the cold-start path
// of bridge-templates-sync (which is push-based) so agents can force a
// fresh pull on demand and keep designs in lock-step with Presale.
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
  Deno.env.get("BRIDGE_SECRET") ?? Deno.env.get("PRESALE_BRIDGE_SECRET") ?? "";
const PRESALE_ANON =
  Deno.env.get("PRESALE_ANON_KEY") ?? "";

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
    // Auth: must be a signed-in CRM team member
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

    // Try Presale's scoped bridge-list-templates first, then fall back to the
    // public serve-auto-templates endpoint that's been live for months. The
    // earlier feature flag (PRESALE_TEMPLATE_SYNC_ENABLED) was a stub for the
    // scoped contract — when set to "false" we still attempt the fallback so
    // the agent's "Sync from Presale" button always returns real data.
    // Always prefer the scoped endpoint (returns the agent's saved templates)
    // whenever PRESALE_ANON is configured. The legacy feature flag is kept as
    // an opt-OUT only — set PRESALE_TEMPLATE_SYNC_ENABLED=false to force the
    // public fallback. Default = scoped first, fallback to serve-auto-templates.
    const flag = (Deno.env.get("PRESALE_TEMPLATE_SYNC_ENABLED") ?? "").toLowerCase();
    const preferScoped = flag !== "false";
    if (!BRIDGE_SECRET) {
      return json({ error: "bridge_not_configured" }, 500);
    }

    // Fetch live list from Presale (with retry for cold boots).
    // Order of attempts:
    //   1. bridge-list-templates (scoped, agent_slug-aware)  — only if PRESALE_ANON is configured
    //   2. serve-auto-templates  (public bridge, returns the same shape)
    async function tryFetch(url: string, init: RequestInit): Promise<{ res: Response | null; body: string }> {
      let res: Response | null = null;
      let body = "";
      for (let i = 0; i < 3; i++) {
        res = await fetch(url, init);
        body = await res.text();
        if (res.ok) break;
        if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
      return { res, body };
    }

    let upstream: Response | null = null;
    let text = "";
    const diag: Record<string, unknown> = { caller_slug: callerSlug, prefer_scoped: preferScoped, has_presale_anon: !!PRESALE_ANON };

    if (preferScoped && PRESALE_ANON) {
      const scoped = await tryFetch(`${BRIDGE_URL}/bridge-list-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": BRIDGE_SECRET,
          "Authorization": `Bearer ${PRESALE_ANON}`,
          "apikey": PRESALE_ANON,
        },
        body: JSON.stringify({ agent_slug: callerSlug, include_team: true }),
      });
      diag.scoped_status = scoped.res?.status ?? null;
      diag.scoped_body_preview = scoped.body.slice(0, 240);
      if (scoped.res?.ok) { upstream = scoped.res; text = scoped.body; diag.used = "scoped"; }
    }

    if (!upstream || !upstream.ok) {
      const fallback = await tryFetch(`${BRIDGE_URL}/serve-auto-templates`, {
        method: "GET",
        headers: { "x-bridge-secret": BRIDGE_SECRET },
      });
      upstream = fallback.res;
      text = fallback.body;
      diag.fallback_status = fallback.res?.status ?? null;
      if (!diag.used) diag.used = "fallback_serve_auto_templates";
    }

    if (!upstream || !upstream.ok) {
      return json({ error: "upstream_error", status: upstream?.status, body: text.slice(0, 300), diag }, 502);
    }

    let payload: any;
    try { payload = JSON.parse(text); } catch { payload = {}; }
    const templates: any[] = Array.isArray(payload?.templates) ? payload.templates : [];

    const results: { slug: string; action: string }[] = [];
    const now = new Date().toISOString();

    for (const t of templates) {
      const slug = t.slug ?? t.id ?? t.external_id;
      if (!slug || !t.name || !t.subject) {
        results.push({ slug: slug ?? "(unknown)", action: "skipped_missing_fields" });
        continue;
      }
      const html = t.body_html ?? t.html ?? "";
      const incomingHash = await hashContent(`${t.subject}|${html}`);

      // Resolve ownership scope from Presale payload (defaults to team)
      const rawScope: string = (t.owner_scope ?? "team:presale").toString().toLowerCase();
      const ownerAgentSlug: string | null =
        rawScope.startsWith("agent:")
          ? (t.owner_agent_slug ?? rawScope.slice("agent:".length)) || null
          : null;
      // Defense in depth: if Presale somehow returned another agent's private template, skip.
      if (ownerAgentSlug && callerSlug && ownerAgentSlug !== callerSlug && !isAdmin) {
        results.push({ slug, action: "skipped_other_agent" });
        continue;
      }
      const ownerScope = ownerAgentSlug ? `agent:${ownerAgentSlug}` : "team:presale";

      // Match on slug first (canonical), then fall back to external_id
      const { data: existing } = await admin
        .from("crm_email_templates")
        .select("id, sync_hash")
        .or(`slug.eq.${slug},external_id.eq.${slug}`)
        .maybeSingle();

      const row = {
        slug,
        external_id: slug,
        name: t.name,
        subject: t.subject,
        body_html: html,
        category: t.category ?? "general",
        project: t.project ?? null,
        merge_tags: t.merge_tags ?? [],
        source: "presale",
        sync_hash: incomingHash,
        last_synced_at: now,
        is_active: true,
        updated_at: now,
        owner_scope: ownerScope,
        owner_agent_slug: ownerAgentSlug,
        created_by_agent_slug: t.created_by_agent_slug ?? ownerAgentSlug ?? null,
      };

      if (existing) {
        if (existing.sync_hash === incomingHash) {
          await admin.from("crm_email_templates")
            .update({ last_synced_at: now })
            .eq("id", existing.id);
          results.push({ slug, action: "unchanged" });
        } else {
          await admin.from("crm_email_templates").update(row).eq("id", existing.id);
          results.push({ slug, action: "updated" });
        }
      } else {
        await admin.from("crm_email_templates").insert(row);
        results.push({ slug, action: "created" });
      }
    }

    return json({ ok: true, count: templates.length, results, synced_at: now });
  } catch (e) {
    console.error("[sync-bridge-templates]", e);
    return json({ error: String(e) }, 500);
  }
});
