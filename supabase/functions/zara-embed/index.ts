// Zara embeddings proxy — OpenAI text-embedding-3-small (1536 dims).
// Input:  { texts: string[] }   (max batch 100)
// Output: { embeddings: number[][] }  in same order
//
// Fails loud if OPENAI_API_KEY is missing — callers must handle that case
// (zara-chat degrades gracefully, zara-ingest-document marks doc as failed).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MODEL = "text-embedding-3-small";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured. Add it under Lovable Cloud secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    const texts = body?.texts;
    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ error: "texts (string[]) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (texts.length > 100) {
      return new Response(JSON.stringify({ error: "max batch size is 100" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OpenAI rejects empty strings; replace with a single space placeholder.
    const cleaned = texts.map((t) => (typeof t === "string" && t.trim().length > 0 ? t : " "));

    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: cleaned }),
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return new Response(JSON.stringify({ error: `OpenAI ${r.status}: ${errTxt.slice(0, 500)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await r.json();
    // OpenAI returns data sorted by index, but we re-sort defensively.
    const sorted = [...(json.data ?? [])].sort((a: any, b: any) => a.index - b.index);
    const embeddings = sorted.map((d: any) => d.embedding as number[]);

    return new Response(
      JSON.stringify({ embeddings, model: MODEL, total_tokens: json.usage?.total_tokens ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
