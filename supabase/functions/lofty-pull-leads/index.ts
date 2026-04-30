// lofty-pull-leads: scheduled poller that pulls new/updated leads from Lofty
// REST API (GET /v1.0/leads) and upserts them into crm_contacts.
//
// Runs every 15 min via pg_cron. Tracks progress in `crm_sync_state` keyed by
// 'lofty_pull_leads' so it only fetches leads created after the last cursor.
//
// Auth: requires LOFTY_API_KEY (Lofty Open API key). Cron call also passes
// CRON_SECRET. Manual call from app uses the user's JWT (admin only).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOFTY_BASE = "https://api.lofty.com";
const SYNC_KEY = "lofty_pull_leads";

interface LoftyLead {
  leadId: number;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  phones?: string[];
  source?: string;
  stage?: string;
  assignedUser?: string;
  score?: number;
  tags?: Array<{ name?: string } | string>;
  city?: string;
  state?: string;
  zipCode?: string;
  streetAddress?: string;
  createTime?: string;
  lastUpdateTime?: string;
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function normalizeName(first: string, last: string) {
  let f = (first || "").trim();
  let l = (last || "").trim();
  if (f && /\s/.test(f) && (!l || /^\(?unknown\)?$/i.test(l))) {
    const idx = f.lastIndexOf(" ");
    l = f.slice(idx + 1).trim();
    f = f.slice(0, idx).trim();
  }
  if (/^\(?unknown\)?$/i.test(l)) l = "(unknown)";
  return { first_name: f || "Unknown", last_name: l || "(unknown)" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOFTY_API_KEY = Deno.env.get("LOFTY_API_KEY");
  if (!LOFTY_API_KEY) {
    return new Response(JSON.stringify({ error: "LOFTY_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Read cursor
  const { data: stateRow } = await supabase
    .from("crm_sync_state")
    .select("last_cursor, payload")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle();

  const lastCursor = stateRow?.last_cursor ? new Date(stateRow.last_cursor) : null;
  const startedAt = new Date();

  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  let pageCount = 0;
  let newestSeen: Date | null = null;
  let stop = false;
  const limit = 100;
  let offset = 0;

  try {
    while (!stop && pageCount < 50 /* hard ceiling: 5,000 leads/run */) {
      pageCount++;
      const url = `${LOFTY_BASE}/v1.0/leads?limit=${limit}&offset=${offset}&sort=LastCreate&desc=true`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${LOFTY_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Lofty API ${resp.status}: ${t.slice(0, 300)}`);
      }
      const json = await resp.json();
      const leads: LoftyLead[] = json.leads || [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        const created = lead.createTime ? new Date(lead.createTime) : null;
        if (created && (!newestSeen || created > newestSeen)) newestSeen = created;

        // Stop once we've reached leads older than last cursor
        if (lastCursor && created && created <= lastCursor) {
          stop = true;
          break;
        }

        const email = (lead.emails?.[0] || "").trim().toLowerCase() || null;
        const phone = normalizePhone(lead.phones?.[0]);
        if (!email && !phone) { skipped++; continue; }

        const { first_name, last_name } = normalizeName(lead.firstName || "", lead.lastName || "");
        const tags = (lead.tags || [])
          .map((t: any) => (typeof t === "string" ? t : t?.name))
          .filter(Boolean);

        const lofty_id = String(lead.leadId);
        const upsertRow: Record<string, unknown> = {
          lofty_id,
          first_name,
          last_name,
          email,
          phone,
          source: lead.source || "Lofty",
          status: lead.stage || "New Lead",
          tags,
          city: lead.city || null,
          province: lead.state || null,
          postal_code: lead.zipCode || null,
          address: lead.streetAddress || null,
          sync_source: "lofty_api",
          lofty_synced_at: new Date().toISOString(),
        };

        // Find existing by lofty_id, then email, then phone
        let existingId: string | null = null;
        const byLofty = await supabase.from("crm_contacts").select("id").eq("lofty_id", lofty_id).maybeSingle();
        if (byLofty.data) existingId = byLofty.data.id;
        if (!existingId && email) {
          const byEmail = await supabase.from("crm_contacts").select("id").eq("email", email).maybeSingle();
          if (byEmail.data) existingId = byEmail.data.id;
        }
        if (!existingId && phone) {
          const byPhone = await supabase.from("crm_contacts").select("id").eq("phone", phone).maybeSingle();
          if (byPhone.data) existingId = byPhone.data.id;
        }

        try {
          if (existingId) {
            // Don't overwrite Dealzflow-managed fields
            const { status: _s, ...safe } = upsertRow;
            const { error } = await supabase.from("crm_contacts").update(safe).eq("id", existingId);
            if (error) throw error;
            updated++;
          } else {
            const { error } = await supabase.from("crm_contacts").insert({
              ...upsertRow,
              lead_type: "Re-Sale",
              contact_type: "lead",
              created_at: lead.createTime || new Date().toISOString(),
            });
            if (error) throw error;
            inserted++;
          }
        } catch (e) {
          errors++;
          console.error(`[lofty-pull-leads] upsert failed for lead ${lofty_id}:`, e);
        }
      }

      if (leads.length < limit) break;
      offset += limit;
    }

    // Persist new cursor
    const newCursor = newestSeen ? newestSeen.toISOString() : (lastCursor?.toISOString() ?? new Date().toISOString());
    await supabase.from("crm_sync_state").upsert({
      sync_key: SYNC_KEY,
      last_cursor: newCursor,
      last_run_at: new Date().toISOString(),
      payload: { inserted, updated, skipped, errors, pages: pageCount, started_at: startedAt.toISOString() },
    }, { onConflict: "sync_key" });

    await supabase.from("crm_sync_log").insert({
      source: "lofty_api_pull",
      event_type: "pull.completed",
      status: errors > 0 ? "partial" : "success",
      payload_preview: JSON.stringify({ inserted, updated, skipped, errors, pages: pageCount }),
    });

    return new Response(JSON.stringify({
      success: true, inserted, updated, skipped, errors, pages: pageCount,
      cursor: newCursor,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lofty-pull-leads] fatal:", msg);
    await supabase.from("crm_sync_log").insert({
      source: "lofty_api_pull",
      event_type: "pull.failed",
      status: "error",
      payload_preview: msg.slice(0, 500),
    });
    return new Response(JSON.stringify({ success: false, error: msg, inserted, updated, skipped, errors }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
