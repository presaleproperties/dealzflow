// Manually enroll one or many contacts into an automation. Authenticated CRM
// admins only. Returns counts of newly-enrolled vs. already-active.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = await userClient.auth.getUser();
  if (!who?.user?.id) return json({ error: "unauthorized" }, 401);

  const { data: isAdmin } = await userClient.rpc("is_crm_admin" as never, { _user_id: who.user.id } as never);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const automationId = body?.automation_id as string | undefined;
  const contactIds: string[] = Array.isArray(body?.contact_ids) ? body.contact_ids : [];
  const triggerData = body?.trigger_data ?? { event: "manual" };
  if (!automationId || contactIds.length === 0) return json({ error: "bad_request" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  let enrolled = 0, skipped = 0, failed = 0;
  for (const cid of contactIds) {
    const { data, error } = await admin.rpc("enroll_in_automation" as never, {
      p_automation_id: automationId, p_contact_id: cid, p_trigger_data: triggerData,
    } as never);
    if (error) { failed++; continue; }
    if (data) enrolled++; else skipped++;
  }
  return json({ ok: true, enrolled, skipped, failed });
});
