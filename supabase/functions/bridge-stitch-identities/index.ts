// Identity stitching: backfill presale_user_id on existing CRM contacts.
//
// Two modes:
//  1) batch    — POST { mappings: [{ email, presale_user_id }, ...] }
//                Upserts presale_user_id onto matching crm_contacts (by lowercased email).
//                Skips rows where the contact already has a *different* presale_user_id
//                (caller can pass `force: true` to override).
//
//  2) report   — POST { mode: "report" }
//                Returns counts: total contacts, linked, unlinked, conflicts.
//
// Auth: x-bridge-secret header (same secret as bridge-ingest-lead / bridge-ingest-behavior).
//
// Idempotent: re-running the same batch is a no-op.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Mapping {
  email: string;
  presale_user_id: string;
}

interface BatchRequest {
  mode?: "batch";
  mappings: Mapping[];
  force?: boolean;
}

interface ReportRequest {
  mode: "report";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth
  const secret = req.headers.get("x-bridge-secret");
  if (!secret || secret !== Deno.env.get("BRIDGE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: BatchRequest | ReportRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // ── REPORT MODE ──────────────────────────────────────────────────────────
  if ((body as ReportRequest).mode === "report") {
    const [{ count: total }, { count: linked }, { count: unlinkedWithEmail }] =
      await Promise.all([
        supabase.from("crm_contacts").select("id", { count: "exact", head: true }),
        supabase
          .from("crm_contacts")
          .select("id", { count: "exact", head: true })
          .not("presale_user_id", "is", null),
        supabase
          .from("crm_contacts")
          .select("id", { count: "exact", head: true })
          .is("presale_user_id", null)
          .not("email", "is", null),
      ]);
    return json({
      total_contacts: total ?? 0,
      linked: linked ?? 0,
      unlinked_with_email: unlinkedWithEmail ?? 0,
    });
  }

  // ── BATCH MODE ───────────────────────────────────────────────────────────
  const batch = body as BatchRequest;
  const force = !!batch.force;
  if (!Array.isArray(batch.mappings) || batch.mappings.length === 0) {
    return json({ error: "mappings[] required" }, 400);
  }
  if (batch.mappings.length > 2000) {
    return json({ error: "max 2000 mappings per request" }, 400);
  }

  // Normalize input + drop bad rows
  const cleaned: Mapping[] = [];
  for (const m of batch.mappings) {
    const email = m?.email?.trim().toLowerCase();
    const pid = m?.presale_user_id?.trim();
    if (email && pid) cleaned.push({ email, presale_user_id: pid });
  }
  if (cleaned.length === 0) {
    return json({ error: "no valid mappings after normalization" }, 400);
  }

  // Pull existing contacts for all emails in a single query
  const emails = Array.from(new Set(cleaned.map((m) => m.email)));
  const { data: existing, error: fetchErr } = await supabase
    .from("crm_contacts")
    .select("id, email, presale_user_id")
    .in("email", emails);
  if (fetchErr) {
    console.error("[stitch] fetch error", fetchErr);
    return json({ error: fetchErr.message }, 500);
  }

  const byEmail = new Map<string, { id: string; presale_user_id: string | null }>();
  for (const c of existing ?? []) {
    if (c.email) byEmail.set(c.email.toLowerCase(), { id: c.id, presale_user_id: c.presale_user_id });
  }

  const updates: Array<{ id: string; presale_user_id: string }> = [];
  let alreadyLinked = 0;
  let conflicts = 0;
  let notFound = 0;

  for (const m of cleaned) {
    const c = byEmail.get(m.email);
    if (!c) {
      notFound++;
      continue;
    }
    if (c.presale_user_id === m.presale_user_id) {
      alreadyLinked++;
      continue;
    }
    if (c.presale_user_id && !force) {
      conflicts++;
      continue;
    }
    updates.push({ id: c.id, presale_user_id: m.presale_user_id });
  }

  // Apply updates one-by-one (small batches; ~few thousand max)
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("crm_contacts")
      .update({ presale_user_id: u.presale_user_id })
      .eq("id", u.id);
    if (error) {
      console.error("[stitch] update error", u.id, error.message);
    } else {
      updated++;
    }
  }

  return json({
    received: batch.mappings.length,
    valid: cleaned.length,
    updated,
    skipped: alreadyLinked,
    already_linked: alreadyLinked,
    conflicts,
    notFound,
    not_found: notFound,
    forced: force,
  });
});
