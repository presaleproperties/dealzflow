import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function success(data: unknown, count?: number) {
  const res: Record<string, unknown> = { success: true, data };
  if (count !== undefined) res.count = count;
  return json(res);
}

function error(message: string, code: number) {
  return json({ success: false, error: message, code }, code);
}

// Rate limit map: apiKeyId -> { count, resetAt }
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(keyId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(keyId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ─── Table mappings ─────────────────────────────────────────────────────
const TABLE_MAP: Record<string, string> = {
  leads: "pipeline_prospects",
  deals: "deals",
  clients: "client_inventory",
  events: "daily_focus",
};

// ─── CRUD helpers ───────────────────────────────────────────────────────
async function listRecords(
  supabase: ReturnType<typeof createClient>,
  table: string,
  url: URL
) {
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let query = supabase.from(table).select("*", { count: "exact" });

  if (search) {
    // Search across text columns
    if (table === "pipeline_prospects") {
      query = query.or(`client_name.ilike.%${search}%,notes.ilike.%${search}%`);
    } else if (table === "deals") {
      query = query.or(`client_name.ilike.%${search}%,address.ilike.%${search}%,project_name.ilike.%${search}%`);
    } else if (table === "client_inventory") {
      query = query.or(`buyer_name.ilike.%${search}%,property_address.ilike.%${search}%,project_name.ilike.%${search}%`);
    } else if (table === "daily_focus") {
      query = query.ilike("text", `%${search}%`);
    }
  }

  if (status) {
    query = query.eq("status", status);
  }

  query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

  const { data, error: err, count } = await query;
  if (err) return error(err.message, 500);
  return success(data, count ?? 0);
}

async function getRecord(supabase: ReturnType<typeof createClient>, table: string, id: string) {
  const { data, error: err } = await supabase.from(table).select("*").eq("id", id).single();
  if (err) return error(err.message, err.code === "PGRST116" ? 404 : 500);
  return success(data);
}

async function createRecord(supabase: ReturnType<typeof createClient>, table: string, body: unknown) {
  const { data, error: err } = await supabase.from(table).insert(body).select().single();
  if (err) return error(err.message, 400);
  return json({ success: true, data }, 201);
}

async function updateRecord(supabase: ReturnType<typeof createClient>, table: string, id: string, body: unknown) {
  const { data, error: err } = await supabase.from(table).update(body).eq("id", id).select().single();
  if (err) return error(err.message, err.code === "PGRST116" ? 404 : 500);
  return success(data);
}

async function deleteRecord(supabase: ReturnType<typeof createClient>, table: string, id: string) {
  const { error: err } = await supabase.from(table).delete().eq("id", id);
  if (err) return error(err.message, 500);
  return success({ deleted: true });
}

async function bulkUpsert(supabase: ReturnType<typeof createClient>, table: string, body: unknown) {
  if (!Array.isArray(body)) return error("Body must be an array", 400);
  if (body.length > 500) return error("Max 500 records per bulk request", 400);
  const { data, error: err } = await supabase.from(table).upsert(body).select();
  if (err) return error(err.message, 400);
  return json({ success: true, data, count: data?.length ?? 0 }, 201);
}

// ─── Schema introspection ───────────────────────────────────────────────
async function getSchema(supabase: ReturnType<typeof createClient>) {
  const { data, error: err } = await supabase.rpc("", {}).maybeSingle();
  // Use direct query instead
  const tables = [
    "deals", "pipeline_prospects", "client_inventory", "daily_focus",
    "expenses", "payouts", "settings", "profiles", "synced_transactions",
    "network_agents", "network_summary", "revenue_share", "conversations",
    "messages", "properties", "other_income", "api_keys", "api_logs",
  ];

  const schema: Record<string, string[]> = {};
  for (const t of tables) {
    const { data: rows } = await supabase.from(t).select("*").limit(0);
    // Get column names from an empty result set by fetching 1 row
    const { data: sample } = await supabase.from(t).select("*").limit(1);
    if (sample && sample.length > 0) {
      schema[t] = Object.keys(sample[0]);
    } else {
      schema[t] = [];
    }
  }
  return success(schema);
}

// ─── Full text search ───────────────────────────────────────────────────
async function fullTextSearch(supabase: ReturnType<typeof createClient>, url: URL) {
  const q = url.searchParams.get("q");
  if (!q) return error("Missing ?q= parameter", 400);
  
  const tablesParam = url.searchParams.get("tables") || "leads,clients,deals";
  const searchTables = tablesParam.split(",").map(t => t.trim());

  const results: Record<string, unknown[]> = {};

  for (const t of searchTables) {
    const table = TABLE_MAP[t];
    if (!table) continue;
    
    let query = supabase.from(table).select("*");
    if (table === "pipeline_prospects") {
      query = query.or(`client_name.ilike.%${q}%,notes.ilike.%${q}%`);
    } else if (table === "deals") {
      query = query.or(`client_name.ilike.%${q}%,address.ilike.%${q}%,project_name.ilike.%${q}%`);
    } else if (table === "client_inventory") {
      query = query.or(`buyer_name.ilike.%${q}%,property_address.ilike.%${q}%`);
    }
    query = query.limit(20);
    const { data } = await query;
    if (data) results[t] = data;
  }

  return success(results);
}

// ─── Log API call ───────────────────────────────────────────────────────
async function logApiCall(
  supabase: ReturnType<typeof createClient>,
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ip: string | null
) {
  await supabase.from("api_logs").insert({
    api_key_id: keyId,
    endpoint,
    method,
    status_code: statusCode,
    ip_address: ip,
  });
}

// ─── Main handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Extract path after /zara-api/
  const fullPath = url.pathname;
  const pathMatch = fullPath.match(/\/zara-api\/(.*)/);
  const path = pathMatch ? pathMatch[1] : "";
  const method = req.method;

  // ── Validate API key ──
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return error("Missing x-api-key header", 401);

  const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: keyRecord } = await adminSupabase
    .from("api_keys")
    .select("id, is_active")
    .eq("key", apiKey)
    .single();

  if (!keyRecord || !keyRecord.is_active) {
    return error("Invalid or inactive API key", 401);
  }

  // ── Rate limit ──
  if (!checkRateLimit(keyRecord.id)) {
    await logApiCall(adminSupabase, keyRecord.id, path, method, 429, req.headers.get("x-forwarded-for"));
    return error("Rate limit exceeded (200/min)", 429);
  }

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;

  let response: Response;

  try {
    // ── Route matching ──
    // CRUD routes: leads, deals, clients, events
    const crudMatch = path.match(/^(leads|deals|clients|events)(?:\/(.+))?$/);
    const bulkMatch = path.match(/^(leads|deals|clients)\/bulk$/);

    if (bulkMatch && method === "POST") {
      const table = TABLE_MAP[bulkMatch[1]];
      const body = await req.json();
      response = await bulkUpsert(adminSupabase, table, body);
    } else if (crudMatch) {
      const resource = crudMatch[1];
      const id = crudMatch[2];
      const table = TABLE_MAP[resource];

      if (id) {
        if (method === "GET") response = await getRecord(adminSupabase, table, id);
        else if (method === "PUT") response = await updateRecord(adminSupabase, table, id, await req.json());
        else if (method === "DELETE") response = await deleteRecord(adminSupabase, table, id);
        else response = error("Method not allowed", 405);
      } else {
        if (method === "GET") response = await listRecords(adminSupabase, table, url);
        else if (method === "POST") response = await createRecord(adminSupabase, table, await req.json());
        else response = error("Method not allowed", 405);
      }
    } else if (path === "schema" && method === "GET") {
      response = await getSchema(adminSupabase);
    } else if (path === "search" && method === "GET") {
      response = await fullTextSearch(adminSupabase, url);
    } else if (path === "sync/rezen" && method === "POST") {
      // Trigger reZEN sync - call the existing sync-platform function
      const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-platform`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ type: "manual" }),
      });
      const syncData = await syncRes.json();
      response = success(syncData);
    } else {
      response = error("Not found", 404);
    }
  } catch (e) {
    response = error(e instanceof Error ? e.message : "Internal server error", 500);
  }

  // Log the call
  const statusCode = response.status;
  await logApiCall(adminSupabase, keyRecord.id, path, method, statusCode, ip);

  return response;
});
