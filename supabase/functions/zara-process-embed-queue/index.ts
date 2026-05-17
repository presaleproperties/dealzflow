// Background processor for queued Zara embedding jobs.
// Picks up due rows from zara_embed_queue, calls zara-embed, writes the vector
// back to the target row, retries with exponential backoff on failure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const svc = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function embed(text: string): Promise<number[]> {
  const r = await fetch(`${FUNCTIONS_BASE}/zara-embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ texts: [text.slice(0, 8000)] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `embed failed (${r.status})`);
  const v = j?.embeddings?.[0];
  if (!Array.isArray(v)) throw new Error("embed returned no vector");
  return v;
}

function backoffSeconds(attempts: number): number {
  // 30s, 2m, 8m, 30m, 2h, 8h
  return Math.min(8 * 60 * 60, 30 * Math.pow(4, attempts));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = svc();
  const batchSize = 10;

  // Pull due jobs (pending or failed-with-retries-left whose backoff has elapsed).
  const { data: jobs, error } = await sb
    .from("zara_embed_queue")
    .select("id, kind, target_id, embed_text, attempts, max_attempts")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs ?? []) {
    if (job.attempts >= job.max_attempts) {
      await sb
        .from("zara_embed_queue")
        .update({ status: "failed", last_error: "max attempts exceeded" })
        .eq("id", job.id);
      results.push({ id: job.id, skipped: "max attempts" });
      continue;
    }

    // Mark processing.
    await sb
      .from("zara_embed_queue")
      .update({ status: "processing" })
      .eq("id", job.id);

    try {
      const vector = await embed(job.embed_text);

      // Write the embedding back to the right target table.
      let writeErr: string | null = null;
      if (job.kind === "winning_conversation") {
        const { error: e } = await sb
          .from("zara_winning_conversations")
          .update({ embedding: vector as unknown as number[] })
          .eq("id", job.target_id);
        if (e) writeErr = e.message;
      } else if (job.kind === "knowledge_chunk") {
        const { error: e } = await sb
          .from("zara_knowledge_chunks")
          .update({ embedding: vector as unknown as number[] })
          .eq("id", job.target_id);
        if (e) writeErr = e.message;
      } else if (job.kind === "knowledge_document") {
        // Defer to the ingest pipeline so it re-chunks + re-embeds.
        const r = await fetch(`${FUNCTIONS_BASE}/zara-ingest-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ documentId: job.target_id }),
        });
        if (!r.ok) writeErr = `ingest re-trigger failed (${r.status})`;
      } else {
        writeErr = `unknown kind: ${job.kind}`;
      }

      if (writeErr) throw new Error(writeErr);

      await sb
        .from("zara_embed_queue")
        .update({
          status: "done",
          last_error: null,
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);
      results.push({ id: job.id, ok: true });
    } catch (e) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.max_attempts;
      const next = new Date(
        Date.now() + backoffSeconds(attempts) * 1000,
      ).toISOString();
      await sb
        .from("zara_embed_queue")
        .update({
          status: exhausted ? "failed" : "pending",
          attempts,
          last_error: e instanceof Error ? e.message : String(e),
          next_attempt_at: next,
        })
        .eq("id", job.id);
      results.push({ id: job.id, ok: false, attempts, exhausted });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
