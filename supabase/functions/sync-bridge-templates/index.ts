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
  Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET") ?? "";
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
      .select("user_id")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    if (!BRIDGE_SECRET || !PRESALE_ANON) {
      return json({ error: "bridge_not_configured" }, 500);
    }

    // Fetch live list from Presale (with retry for cold boots)
    let upstream: Response | null = null;
    let text = "";
    for (let i = 0; i < 3; i++) {
      upstream = await fetch(`${BRIDGE_URL}/bridge-list-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": BRIDGE_SECRET,
          "Authorization": `Bearer ${PRESALE_ANON}`,
          "apikey": PRESALE_ANON,
        },
        body: JSON.stringify({}),
      });
      text = await upstream.text();
      if (upstream.ok) break;
      if (upstream.status < 500 && upstream.status !== 408 && upstream.status !== 429) break;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
    if (!upstream || !upstream.ok) {
      return json({ error: "upstream_error", status: upstream?.status, body: text.slice(0, 300) }, 502);
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
      };

      if (existing) {
        if (existing.sync_hash === incomingHash) {
          // Still bump last_synced_at so the UI can show a fresh check
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
