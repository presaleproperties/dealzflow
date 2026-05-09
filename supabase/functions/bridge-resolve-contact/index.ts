// Public lookup for the Presale website: given email/phone/presale_user_id,
// returns whether the contact exists in DealsFlow + assigned-agent envelope so
// the website can render lifecycle-aware CTAs and the agent card.
// Auth: x-bridge-secret header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = req.headers.get("x-bridge-secret");
  if (!secret || secret !== Deno.env.get("BRIDGE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }

  let email: string | null = null;
  let phone: string | null = null;
  let presaleUserId: string | null = null;

  if (req.method === "GET") {
    const u = new URL(req.url);
    email = u.searchParams.get("email")?.trim().toLowerCase() ?? null;
    phone = u.searchParams.get("phone")?.trim() ?? null;
    presaleUserId = u.searchParams.get("presale_user_id")?.trim() ?? null;
  } else {
    try {
      const b = await req.json();
      email = b?.email?.trim().toLowerCase() ?? null;
      phone = b?.phone?.trim() ?? null;
      presaleUserId = b?.presale_user_id?.trim() ?? null;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
  }

  if (!email && !phone && !presaleUserId) {
    return json({ error: "email, phone, or presale_user_id required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identity stitch: presale_user_id → email → phone
  let contact: any = null;
  if (presaleUserId) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, status, tags, lead_tier, last_activity_at, assigned_to")
      .eq("presale_user_id", presaleUserId)
      .maybeSingle();
    contact = data;
  }
  if (!contact && email) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, status, tags, lead_tier, last_activity_at, assigned_to")
      .ilike("email", email)
      .maybeSingle();
    contact = data;
  }
  if (!contact && phone) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, status, tags, lead_tier, last_activity_at, assigned_to")
      .eq("phone", phone)
      .maybeSingle();
    contact = data;
  }

  if (!contact) {
    return json({ known: false });
  }

  let assignedAgent: Record<string, unknown> | null = null;
  if (contact.assigned_to) {
    const { data: agent } = await supabase
      .from("crm_team")
      .select("id, display_name, email, phone, avatar_url, calendly_url, presale_email")
      .eq("display_name", contact.assigned_to)
      .maybeSingle();
    if (agent) {
      assignedAgent = {
        id: agent.id,
        name: agent.display_name,
        email: agent.presale_email || agent.email || null,
        phone: agent.phone || null,
        photo_url: agent.avatar_url || null,
        calendly_url: agent.calendly_url || null,
      };
    }
  }

  const tags: string[] = contact.tags ?? [];
  const hotLead = (contact.lead_tier === "hot") || tags.includes("hot");

  return json({
    known: true,
    crm_contact_id: contact.id,
    lifecycle_stage: contact.status ?? null,
    tags,
    hot_lead: hotLead,
    last_activity_at: contact.last_activity_at ?? null,
    assigned_agent: assignedAgent,
  });
});
