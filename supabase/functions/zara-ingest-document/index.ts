// Zara document ingester.
//
// Input:  { documentId: string }
// Loads zara_knowledge_documents row, transitions
//   pending → chunking → embedding → indexed (or failed).
//
// Chunks raw_content into ~400-token chunks with 50-token overlap, respecting
// paragraph boundaries. Embeds each batch (max 50 per OpenAI call) via the
// sibling zara-embed function. Inserts chunks into zara_knowledge_chunks
// using the service role (the only writer allowed by RLS).
//
// Caps raw_content at 200K tokens; rejects larger uploads with a clear error.
//
// PDF/DOCX extraction happens client-side before insert — this function
// only ingests text already present in raw_content. That keeps Deno-side
// dependencies minimal and the function fast.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const TARGET_TOKENS = 400;
const OVERLAP_TOKENS = 50;
const MAX_DOC_TOKENS = 200_000;
const EMBED_BATCH = 50;

const svc = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Rough token estimator (~4 chars/token, English-biased). Good enough for
// chunk sizing; embedding cost is reported back from OpenAI itself.
function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// Chunk raw text into ~400-token chunks with ~50-token overlap, splitting
// on paragraphs first, then sentences, then hard length.
function chunkText(raw: string): { content: string; tokens: number }[] {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: { content: string; tokens: number }[] = [];
  let buf = "";
  let bufTokens = 0;

  const flush = () => {
    const c = buf.trim();
    if (c) chunks.push({ content: c, tokens: bufTokens });
    buf = "";
    bufTokens = 0;
  };

  for (const para of paragraphs) {
    const paraTokens = estTokens(para);

    // If paragraph alone is huge, split by sentence.
    if (paraTokens > TARGET_TOKENS) {
      const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean);
      for (const sent of sentences) {
        const sTokens = estTokens(sent);
        if (bufTokens + sTokens > TARGET_TOKENS && buf) flush();
        // sentence itself too big — hard-slice.
        if (sTokens > TARGET_TOKENS) {
          const chars = TARGET_TOKENS * 4;
          for (let i = 0; i < sent.length; i += chars) {
            const slice = sent.slice(i, i + chars);
            chunks.push({ content: slice, tokens: estTokens(slice) });
          }
        } else {
          buf = buf ? `${buf} ${sent}` : sent;
          bufTokens += sTokens;
        }
      }
      continue;
    }

    if (bufTokens + paraTokens > TARGET_TOKENS && buf) flush();
    buf = buf ? `${buf}\n\n${para}` : para;
    bufTokens += paraTokens;
  }
  flush();

  // Apply overlap: prepend ~50 tokens (≈200 chars) of previous chunk to each.
  if (OVERLAP_TOKENS > 0 && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].content.slice(-OVERLAP_TOKENS * 4);
      chunks[i] = {
        content: `${prevTail}\n…\n${chunks[i].content}`,
        tokens: chunks[i].tokens + OVERLAP_TOKENS,
      };
    }
  }
  return chunks;
}

async function callEmbed(texts: string[]): Promise<number[][]> {
  const r = await fetch(`${FUNCTIONS_BASE}/zara-embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ texts }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? `embed failed (${r.status})`);
  return j.embeddings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { documentId } = await req.json();
    if (!documentId) {
      return new Response(JSON.stringify({ error: "documentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = svc();
    const { data: doc, error: loadErr } = await sb
      .from("zara_knowledge_documents")
      .select("id, raw_content, source_type, title, status")
      .eq("id", documentId)
      .maybeSingle();
    if (loadErr || !doc) {
      return new Response(JSON.stringify({ error: "document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalTokens = estTokens(doc.raw_content ?? "");
    if (totalTokens > MAX_DOC_TOKENS) {
      await sb.from("zara_knowledge_documents").update({
        status: "failed",
        error_message: `Document is ${totalTokens.toLocaleString()} tokens — exceeds ${MAX_DOC_TOKENS.toLocaleString()} cap. Split before re-uploading.`,
      }).eq("id", documentId);
      return new Response(JSON.stringify({ error: "document too large, split first" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete any existing chunks (idempotent re-index).
    await sb.from("zara_knowledge_chunks").delete().eq("document_id", documentId);

    await sb.from("zara_knowledge_documents").update({
      status: "chunking",
      error_message: null,
      total_tokens: totalTokens,
    }).eq("id", documentId);

    const chunks = chunkText(doc.raw_content ?? "");
    if (chunks.length === 0) {
      await sb.from("zara_knowledge_documents").update({
        status: "failed", error_message: "no extractable content",
      }).eq("id", documentId);
      return new Response(JSON.stringify({ error: "no extractable content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("zara_knowledge_documents").update({
      status: "embedding", total_chunks: chunks.length,
    }).eq("id", documentId);

    // Embed in batches of 50.
    const meta = { source_type: doc.source_type, title: doc.title };
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const slice = chunks.slice(i, i + EMBED_BATCH);
      let embeddings: number[][];
      try {
        embeddings = await callEmbed(slice.map((c) => c.content));
      } catch (e) {
        await sb.from("zara_knowledge_documents").update({
          status: "failed", error_message: String((e as Error).message ?? e),
        }).eq("id", documentId);
        return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = slice.map((c, j) => ({
        document_id: documentId,
        chunk_index: i + j,
        content: c.content,
        token_count: c.tokens,
        embedding: embeddings[j] as any,
        metadata: meta,
      }));
      const { error: insErr } = await sb.from("zara_knowledge_chunks").insert(rows);
      if (insErr) {
        await sb.from("zara_knowledge_documents").update({
          status: "failed", error_message: insErr.message,
        }).eq("id", documentId);
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inserted += rows.length;
    }

    await sb.from("zara_knowledge_documents").update({
      status: "indexed", indexed_at: new Date().toISOString(),
    }).eq("id", documentId);

    return new Response(
      JSON.stringify({ ok: true, document_id: documentId, total_chunks: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
