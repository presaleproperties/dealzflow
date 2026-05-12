// Pulls Zara's identity (signature, headshot, phone, calendly, etc.) from
// the Presale Properties bridge and writes it onto her `crm_team` row +
// her default `crm_email_signatures` row. Idempotent — safe to call any
// time (e.g. after Presale signature edits).
//
// Zara is an AI agent and never signs in, so the standard
// `usePresaleSignatureAutoImport` hook (which runs in-browser for the
// logged-in user) never fires for her. This function fills that gap.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge } from "../_shared/presale-bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1. Find Zara's crm_team row
    const { data: zara, error: teamErr } = await admin
      .from("crm_team")
      .select("id, user_id, slug, presale_email, email, display_name")
      .eq("is_ai", true)
      .ilike("display_name", "%zara%")
      .maybeSingle();

    if (teamErr) throw teamErr;
    if (!zara) {
      return new Response(
        JSON.stringify({ error: "No Zara row found in crm_team" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const slug = zara.slug?.trim() || "zara";
    const lookupEmail = (zara.presale_email || zara.email || "").toLowerCase();

    // 2. Resolve via list (slug match first, then email), then fetch full payload.
    const listed: any = await presaleBridge.listAgents();
    const agents: any[] = Array.isArray(listed) ? listed
      : Array.isArray(listed?.agents) ? listed.agents
      : Array.isArray(listed?.data) ? listed.data
      : Array.isArray(listed?.results) ? listed.results
      : [];
    const matchBySlug = agents.find((a) => (a.slug ?? "").toLowerCase() === slug.toLowerCase());
    const matchByEmail = !matchBySlug && lookupEmail
      ? agents.find((a) => (a.email ?? "").toLowerCase() === lookupEmail)
      : undefined;
    const matchByName = !matchBySlug && !matchByEmail
      ? agents.find((a) => (a.name ?? a.full_name ?? "").toLowerCase().includes("zara"))
      : undefined;
    const match = matchBySlug ?? matchByEmail ?? matchByName;
    const identifier = match?.slug ?? match?.id ?? match?.email;
    if (!identifier) {
      return new Response(
        JSON.stringify({
          error: "No matching Presale agent for Zara",
          tried_slug: slug,
          tried_email: lookupEmail,
          available_slugs: agents.map((a) => a.slug).filter(Boolean).slice(0, 20),
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const fullRaw: any = await presaleBridge.getAgent(identifier);
    const full: any = fullRaw?.agent ?? fullRaw?.data ?? fullRaw;

    const signatureHtml = pick<string>(full, [
      "signature_html",
      "signatureHtml",
      "email_signature",
      "signature",
    ]);
    const presaleEmail = pick<string>(full, ["email", "contact_email"]);
    const headshot = pick<string>(full, [
      "headshot_url", "headshotUrl", "photo_url", "avatar_url", "image_url", "headshot",
    ]);

    if (!signatureHtml) {
      return new Response(
        JSON.stringify({
          error: "Presale returned no signature_html for Zara",
          presale_payload_keys: full ? Object.keys(full) : [],
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Update crm_team — used by zara-reply edge function
    const teamPatch: Record<string, unknown> = {
      sender_signature_html: signatureHtml,
    };
    if (presaleEmail && (!zara.presale_email || zara.presale_email.toLowerCase() !== presaleEmail.toLowerCase())) {
      teamPatch.presale_email = presaleEmail;
    }
    const { error: updErr } = await admin
      .from("crm_team")
      .update(teamPatch)
      .eq("id", zara.id);
    if (updErr) throw updErr;

    // 4. Upsert her default `crm_email_signatures` row (used by composer/mass send)
    let signatureRowsUpdated = 0;
    if (zara.user_id) {
      // Try to update an existing default; otherwise insert a fresh one.
      const { data: existing } = await admin
        .from("crm_email_signatures")
        .select("id")
        .eq("user_id", zara.user_id)
        .eq("kind", "full")
        .order("is_default", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        const { error: sigUpdErr } = await admin
          .from("crm_email_signatures")
          .update({ html: signatureHtml, name: "Default signature", is_default: true })
          .eq("id", existing[0].id);
        if (sigUpdErr) throw sigUpdErr;
        signatureRowsUpdated = 1;
      } else {
        const { error: sigInsErr } = await admin
          .from("crm_email_signatures")
          .insert({
            user_id: zara.user_id,
            name: "Default signature",
            html: signatureHtml,
            is_default: true,
            sort_order: 0,
            kind: "full",
          });
        if (sigInsErr) throw sigInsErr;
        signatureRowsUpdated = 1;
      }

      // Also seed crm_email_settings sender_name / reply_to / brand_logo_url
      // if blank — same pattern as usePresaleSignatureAutoImport.
      const { data: settings } = await admin
        .from("crm_email_settings")
        .select("sender_name, reply_to, brand_logo_url")
        .eq("user_id", zara.user_id)
        .maybeSingle();

      const settingsPatch: Record<string, unknown> = { user_id: zara.user_id };
      let needSettings = false;
      if (!settings?.sender_name && full?.name) { settingsPatch.sender_name = full.name; needSettings = true; }
      if (!settings?.reply_to && presaleEmail) { settingsPatch.reply_to = presaleEmail; needSettings = true; }
      if (!settings?.brand_logo_url && headshot) { settingsPatch.brand_logo_url = headshot; needSettings = true; }
      if (needSettings) {
        await admin.from("crm_email_settings").upsert(settingsPatch, { onConflict: "user_id" });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        zara_team_id: zara.id,
        slug,
        presale_email: presaleEmail,
        signature_length: signatureHtml.length,
        team_row_updated: true,
        signature_rows_updated: signatureRowsUpdated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const err = e as Error;
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
