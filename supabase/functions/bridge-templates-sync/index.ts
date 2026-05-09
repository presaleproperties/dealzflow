// Two-way template sync between CRM and Presale Properties.
// GET  → return all CRM templates (for Presale to pull)
// POST → upsert templates pushed from Presale (matched on external_id)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface TemplatePush {
  external_id: string;          // Presale's template id
  name: string;
  subject: string;
  body_html: string;
  category?: string;
  project?: string;
  merge_tags?: string[];
  sync_hash?: string;           // hash of content from Presale
  owner_scope?: string;         // 'team:presale' | 'agent:<slug>'
  owner_agent_slug?: string | null;
  created_by_agent_slug?: string | null;
  deleted?: boolean;            // soft-delete signal
}

async function hashContent(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = req.headers.get("x-bridge-secret");
    if (!secret || secret !== Deno.env.get("BRIDGE_SECRET")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // GET → Presale pulls CRM templates
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("crm_email_templates")
        .select("id, external_id, name, subject, body_html, category, project, merge_tags, source, sync_hash, owner_scope, owner_agent_slug, created_by_agent_slug, updated_at")
        .eq("is_active", true);
      if (error) throw error;

      // Compute hashes for any rows missing them so Presale can diff
      const enriched = await Promise.all((data || []).map(async (t) => ({
        ...t,
        sync_hash: t.sync_hash || await hashContent(`${t.subject}|${t.body_html || ""}`),
      })));

      return new Response(JSON.stringify({ templates: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST → Presale pushes one or many templates
    if (req.method === "POST") {
      const body = await req.json();
      const incoming: TemplatePush[] = Array.isArray(body) ? body : (body.templates || [body]);

      const results: any[] = [];
      for (const t of incoming) {
        if (!t.external_id) {
          results.push({ external_id: t.external_id, error: "missing external_id" });
          continue;
        }

        // Soft-delete signal
        if (t.deleted) {
          await supabase.from("crm_email_templates")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("external_id", t.external_id);
          results.push({ external_id: t.external_id, action: "soft_deleted" });
          continue;
        }

        if (!t.name || !t.subject) {
          results.push({ external_id: t.external_id, error: "missing required fields" });
          continue;
        }

        const incomingHash = t.sync_hash || await hashContent(`${t.subject}|${t.body_html || ""}`);

        // Resolve scope (defaults to team)
        const rawScope = (t.owner_scope ?? "team:presale").toString().toLowerCase();
        const ownerAgentSlug: string | null =
          rawScope.startsWith("agent:")
            ? (t.owner_agent_slug ?? rawScope.slice("agent:".length)) || null
            : null;
        const ownerScope = ownerAgentSlug ? `agent:${ownerAgentSlug}` : "team:presale";

        // Find existing match by external_id
        const { data: existing } = await supabase
          .from("crm_email_templates")
          .select("id, sync_hash, source, owner_scope, owner_agent_slug")
          .eq("external_id", t.external_id)
          .maybeSingle();

        // Ownership-conflict guard: never silently re-assign a template
        // from one agent to another via webhook unless the actor is admin.
        if (existing && existing.owner_scope?.startsWith("agent:")) {
          const wantsDifferentOwner = ownerScope !== existing.owner_scope;
          const actorIsAdmin = (body as any)?.actor_is_admin === true ||
            (Array.isArray(incoming) ? false : (body as any)?.actor_is_admin === true);
          if (wantsDifferentOwner && !actorIsAdmin) {
            results.push({
              external_id: t.external_id,
              error: "ownership_conflict",
              existing_owner: existing.owner_scope,
              incoming_owner: ownerScope,
            });
            continue;
          }
        }

        if (existing) {
          if (existing.sync_hash === incomingHash) {
            results.push({ external_id: t.external_id, action: "unchanged" });
            continue;
          }
          await supabase.from("crm_email_templates").update({
            name: t.name,
            subject: t.subject,
            body_html: t.body_html,
            category: t.category || "general",
            project: t.project || null,
            merge_tags: t.merge_tags || [],
            sync_hash: incomingHash,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            owner_scope: ownerScope,
            owner_agent_slug: ownerAgentSlug,
            created_by_agent_slug: t.created_by_agent_slug ?? null,
          }).eq("id", existing.id);
          results.push({ external_id: t.external_id, action: "updated", id: existing.id });
        } else {
          const { data: created } = await supabase.from("crm_email_templates").insert({
            name: t.name,
            subject: t.subject,
            body_html: t.body_html,
            category: t.category || "general",
            project: t.project || null,
            merge_tags: t.merge_tags || [],
            source: "presale",
            external_id: t.external_id,
            sync_hash: incomingHash,
            last_synced_at: new Date().toISOString(),
            owner_scope: ownerScope,
            owner_agent_slug: ownerAgentSlug,
            created_by_agent_slug: t.created_by_agent_slug ?? ownerAgentSlug,
          }).select("id").single();
          results.push({ external_id: t.external_id, action: "created", id: created?.id });
        }
      }

      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[bridge-templates-sync]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
