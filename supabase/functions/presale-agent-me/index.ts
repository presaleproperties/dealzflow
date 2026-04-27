// Returns the Presale Properties agent profile for the currently
// logged-in DealsFlow user (matched by email). Keeps the bridge secret
// server-side; the browser only ever sees the resolved agent payload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge, BridgeAgent } from "../_shared/presale-bridge.ts";

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

function unwrapList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.agents)) return value.agents;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function normalize(raw: any) {
  if (!raw) return null;
  return {
    slug: pick<string>(raw, ["slug", "id", "agent_slug"]) ?? "",
    name:
      pick<string>(raw, ["name", "full_name", "display_name"]) ??
      [pick<string>(raw, ["first_name"]), pick<string>(raw, ["last_name"])]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      undefined,
    email: pick<string>(raw, ["email", "contact_email"]),
    phone: pick<string>(raw, ["phone", "phone_number", "mobile"]),
    headshotUrl: pick<string>(raw, [
      "headshot_url",
      "headshotUrl",
      "photo_url",
      "avatar_url",
      "image_url",
      "headshot",
    ]),
    signatureHtml: pick<string>(raw, [
      "signature_html",
      "signatureHtml",
      "email_signature",
      "signature",
    ]),
    calendlyUrl: pick<string>(raw, [
      "calendly_url",
      "calendlyUrl",
      "booking_url",
      "calendar_url",
    ]),
    licenseNumber: pick<string>(raw, [
      "license_number",
      "licenseNumber",
      "license",
      "real_estate_license",
    ]),
    brokerage: pick<string>(raw, ["brokerage", "brokerage_name", "company"]),
    websiteUrl: pick<string>(raw, [
      "website_url",
      "websiteUrl",
      "website",
      "profile_url",
    ]),
    raw,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify the caller's JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userErr || !user?.email) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = user.email.toLowerCase();

  try {
    // 1. List all agents, find the matching email
    const listed = await presaleBridge.listAgents();
    const agents = unwrapList(listed) as BridgeAgent[];
    const match = agents.find(
      (a) => (a.email ?? "").toLowerCase() === email,
    );

    if (!match?.slug) {
      return new Response(
        JSON.stringify({
          agent: null,
          reason: "no_match",
          message: `No Presale agent found for ${email}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Pull the full agent payload
    const full = await presaleBridge.getAgent(match.slug);
    const agent = normalize(full ?? match);

    return new Response(
      JSON.stringify({ agent, reason: "ok" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const err = e as Error;
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
