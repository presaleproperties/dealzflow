// Browser-callable proxy for read-only Presale bridge endpoints.
// Verifies the caller's JWT (any signed-in user can use it), then
// forwards the request to the bridge with the shared secret.
// The browser never sees PRESALE_BRIDGE_SECRET.

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
  | "get-lead-behavior"
  | "render-email";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify it's a real signed-in user
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { action?: Action; params?: Record<string, string | undefined> } = {};
  try { body = await req.json(); } catch { /* allow */ }

  const action = body.action;
  const params = body.params ?? {};

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
      case "get-lead-behavior": {
        // Enforce lead-visibility: caller must be assigned to (or admin over)
        // a contact whose email/phone matches the requested params.
        const email = (params.email ?? "").trim().toLowerCase();
        const phone = (params.phone ?? "").trim();
        if (!email && !phone) {
          return new Response(JSON.stringify({ error: "missing_email_or_phone" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find candidate contacts by primary email/phone or identity-vault entries.
        const orParts: string[] = [];
        if (email) orParts.push(`email.eq.${email}`, `email_secondary.eq.${email}`);
        if (phone) orParts.push(`phone.eq.${phone}`, `phone_secondary.eq.${phone}`);
        const { data: contacts } = await supabase
          .from("crm_contacts")
          .select("id")
          .or(orParts.join(","))
          .limit(25);

        let visibleId: string | null = null;
        for (const c of contacts ?? []) {
          const { data: ok } = await supabase.rpc("crm_can_see_contact_id", {
            _user_id: userData.user.id,
            _contact_id: c.id,
          });
          if (ok === true) { visibleId = c.id as string; break; }
        }

        // If no row matched, fall back to identity vault lookup.
        if (!visibleId) {
          const idVals: string[] = [];
          if (email) idVals.push(email);
          if (phone) idVals.push(phone);
          const { data: ids } = await supabase
            .from("crm_contact_identities")
            .select("contact_id")
            .in("value", idVals)
            .limit(25);
          for (const r of ids ?? []) {
            const { data: ok } = await supabase.rpc("crm_can_see_contact_id", {
              _user_id: userData.user.id,
              _contact_id: r.contact_id,
            });
            if (ok === true) { visibleId = r.contact_id as string; break; }
          }
        }

        if (!visibleId) {
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        result = await presaleBridge.getLeadBehavior({ email, phone });
        break;
      }
      case "render-email":
        result = await presaleBridge.renderEmail({
          projectSlug: params.projectSlug ?? "",
          agentSlug: params.agentSlug ?? "",
          templateStyle: params.templateStyle ?? "modern",
          leadName: params.leadName,
        });
        break;
      default:
        return new Response(JSON.stringify({ error: `unknown_action:${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as PresaleBridgeError | Error;
    const status = (err as PresaleBridgeError).status ?? 502;
    return new Response(
      JSON.stringify({
        error: err.message,
        body: (err as PresaleBridgeError).body ?? null,
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
