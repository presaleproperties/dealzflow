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
  const authFail = requireBridgeSecret(req);
  if (authFail) return authFail;

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
  const pids = Array.from(new Set(cleaned.map((m) => m.presale_user_id)));

  const { data: existing, error: fetchErr } = await supabase
    .from("crm_contacts")
    .select("id, email, presale_user_id, created_at")
    .in("email", emails);
  if (fetchErr) {
    console.error("[stitch] fetch error", fetchErr);
    return json({ error: fetchErr.message }, 500);
  }

  // Pre-fetch every contact that already OWNS any pid we're about to assign.
  // Without this, the unique index `crm_contacts_presale_user_id_uidx` fires
  // when a different contact already holds the target pid (the cause of the
  // 23505 errors in production).
  const { data: pidHolders, error: holderErr } = await supabase
    .from("crm_contacts")
    .select("id, email, presale_user_id, created_at, tags, projects, notes")
    .in("presale_user_id", pids);
  if (holderErr) {
    console.error("[stitch] holder fetch error", holderErr);
    return json({ error: holderErr.message }, 500);
  }
  const holderByPid = new Map<string, { id: string; email: string | null; created_at: string; tags: string[] | null; projects: string[] | null; notes: string | null }>();
  for (const h of pidHolders ?? []) {
    if (h.presale_user_id) holderByPid.set(h.presale_user_id, h as any);
  }

  const byEmail = new Map<string, { id: string; presale_user_id: string | null; created_at: string }>();
  for (const c of existing ?? []) {
    if (c.email) byEmail.set(c.email.toLowerCase(), { id: c.id, presale_user_id: c.presale_user_id, created_at: c.created_at });
  }

  let updated = 0;
  let merged = 0;
  let alreadyLinked = 0;
  let conflicts = 0;
  let notFound = 0;

  // Re-fetch target row's mergeable fields lazily inside the loop when we hit
  // a conflict — keeps the common path cheap.
  for (const m of cleaned) {
    const target = byEmail.get(m.email);
    if (!target) { notFound++; continue; }
    if (target.presale_user_id === m.presale_user_id) { alreadyLinked++; continue; }
    if (target.presale_user_id && !force) { conflicts++; continue; }

    const holder = holderByPid.get(m.presale_user_id);
    if (holder && holder.id !== target.id) {
      // Two contacts collide on the same presale_user_id.
      // Strategy: keep the OLDER contact as canonical, merge tags/projects/notes
      // from the newer one into it, then clear pid from the newer row before
      // assigning to canonical. Never deletes — leaves an audit trail in notes.
      const targetCreated = Date.parse(target.created_at) || 0;
      const holderCreated = Date.parse(holder.created_at) || 0;
      const canonicalId = targetCreated <= holderCreated ? target.id : holder.id;
      const otherId = canonicalId === target.id ? holder.id : target.id;

      // Pull both rows' mergeable fields
      const { data: rows } = await supabase
        .from("crm_contacts")
        .select("id, tags, projects, notes")
        .in("id", [canonicalId, otherId]);
      const canonicalRow: any = (rows ?? []).find((r: any) => r.id === canonicalId) ?? {};
      const otherRow: any = (rows ?? []).find((r: any) => r.id === otherId) ?? {};

      const mergedTags = Array.from(new Set([...(canonicalRow.tags ?? []), ...(otherRow.tags ?? [])]));
      const mergedProjects = Array.from(new Set([...(canonicalRow.projects ?? []), ...(otherRow.projects ?? [])]));
      const auditLine = `[stitch ${new Date().toISOString()}] merged duplicate contact ${otherId} on presale_user_id ${m.presale_user_id}`;
      const mergedNotes = [canonicalRow.notes, otherRow.notes, auditLine].filter(Boolean).join("\n");

      // Clear pid on the non-canonical row FIRST (releases the unique constraint),
      // then assign to canonical with merged data.
      const { error: clearErr } = await supabase
        .from("crm_contacts")
        .update({ presale_user_id: null, notes: [otherRow.notes, `[stitch] absorbed into ${canonicalId} on ${new Date().toISOString()}`].filter(Boolean).join("\n") })
        .eq("id", otherId);
      if (clearErr) {
        console.error("[stitch] clear pid failed", otherId, clearErr.message);
        conflicts++;
        continue;
      }

      const { error: setErr } = await supabase
        .from("crm_contacts")
        .update({
          presale_user_id: m.presale_user_id,
          tags: mergedTags,
          projects: mergedProjects,
          notes: mergedNotes,
          ai_summary_stale: true,
        })
        .eq("id", canonicalId);
      if (setErr) {
        console.error("[stitch] set pid failed", canonicalId, setErr.message);
        conflicts++;
      } else {
        merged++;
        updated++;
        // Update local view so subsequent mappings see the new state
        holderByPid.set(m.presale_user_id, { ...(holder as any), id: canonicalId });
        if (otherId === target.id) {
          // target lost its row to canonical — refresh local map so any later
          // mapping for this email points at canonical now
          byEmail.set(m.email, { id: canonicalId, presale_user_id: m.presale_user_id, created_at: holder.created_at });
        } else {
          byEmail.set(m.email, { id: canonicalId, presale_user_id: m.presale_user_id, created_at: target.created_at });
        }
      }
      continue;
    }

    // Happy path: no holder collision
    const { error } = await supabase
      .from("crm_contacts")
      .update({ presale_user_id: m.presale_user_id })
      .eq("id", target.id);
    if (error) {
      console.error("[stitch] update error", target.id, error.message);
      conflicts++;
    } else {
      updated++;
      holderByPid.set(m.presale_user_id, { id: target.id, email: m.email, created_at: target.created_at, tags: null, projects: null, notes: null });
    }
  }

  return json({
    received: batch.mappings.length,
    valid: cleaned.length,
    updated,
    merged,
    skipped: alreadyLinked,
    already_linked: alreadyLinked,
    conflicts,
    notFound,
    not_found: notFound,
    forced: force,
  });
});
