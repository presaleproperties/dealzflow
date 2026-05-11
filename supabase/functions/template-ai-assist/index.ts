// Template AI Assist — non-streaming Lovable AI Gateway proxy.
// Returns a single JSON payload so the client can show a diff before applying.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Mode =
  | "improve"
  | "shorten"
  | "lengthen"
  | "tone"
  | "translate"
  | "generate"
  | "subject_lines"
  | "search";

interface SearchCandidate {
  id: string;
  kind: "email" | "sms";
  name: string;
  subject?: string | null;
  snippet?: string | null;
}

type ToneVariant = "friendly" | "professional" | "direct" | "warm" | "luxury";

interface AssistBody {
  mode: Mode;
  /** Existing HTML body (or empty for `generate`). */
  html?: string;
  /** Existing subject line (optional). */
  subject?: string;
  /** Free-text prompt for `generate` and refining other modes. */
  prompt?: string;
  /** For `tone` mode. */
  tone?: ToneVariant;
  /** For `translate` mode — ISO codes (`en`, `zh`, `ko`, `pa`, `hi`). */
  targetLanguage?: string;
  /** Soft guidance for the agent context. */
  agentName?: string;
  /** 'html' (default, for email) or 'plain' (for SMS / WhatsApp). */
  format?: "html" | "plain";
  /** Channel hint — when 'sms' the model keeps replies under 160 chars when possible. */
  channel?: "sms" | "whatsapp" | "email";
  /** For `search` mode — list of templates to rank by relevance. */
  candidates?: SearchCandidate[];
}

const SYSTEM_RULES_HTML = `You are an expert real-estate email copywriter for a luxury Vancouver presale brokerage.

ABSOLUTE RULES — never break these:
1. Output ONLY HTML. Wrap copy in semantic tags (<p>, <h2>, <ul>, <li>, <strong>, <a>). No <html>, <head>, or <body> tags.
2. PRESERVE every merge token EXACTLY as it appears in the input — including {{lead.first_name}}, {{sender.full_name}}, {$opportunity.address}, \${project.name}, etc. Never invent new tokens, never translate token text, never alter casing or punctuation inside the braces.
3. PRESERVE the existing signature block if you see <!--SIGNATURE_START--> ... <!--SIGNATURE_END--> — output it untouched at the end. If absent, do NOT invent a signature.
4. Keep the same overall structure unless the user explicitly asks for restructuring.
5. Never include explanations, markdown fences, or commentary. Output is rendered directly into the email.
6. Brand voice: confident, warm, concise. No emojis unless already present in input. No exclamation marks unless already present.`;

const SYSTEM_RULES_PLAIN = `You are an expert real-estate text-message copywriter for a luxury Vancouver presale brokerage.

ABSOLUTE RULES — never break these:
1. Output PLAIN TEXT ONLY. No HTML tags, no markdown fences, no asterisks, no bullet points unless naturally written ("- " is fine).
2. PRESERVE every merge token EXACTLY as it appears — {{lead.first_name}}, {$first_name}, \${first_name}, etc. Never translate or alter braces.
3. SMS-friendly length: when the channel is SMS, aim for under 160 characters unless the user asked to lengthen.
4. Brand voice: warm, confident, concise. Conversational — like a top agent texting a friend. No corporate fluff. No emojis unless already present.
5. Never include explanations, headers, or commentary. The output goes straight into the message bubble.`;

function buildUserPrompt(b: AssistBody): string {
  const subj = b.subject?.trim() ? `\nCURRENT SUBJECT: ${b.subject}` : "";
  const prompt = b.prompt?.trim() ? `\nUSER NOTES: ${b.prompt}` : "";
  const agent = b.agentName?.trim() ? `\nAGENT NAME (context only): ${b.agentName}` : "";

  switch (b.mode) {
    case "improve":
      return `Improve this email — tighten copy, sharpen hook, keep meaning and length similar.${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    case "shorten":
      return `Cut this email to ~50% of its current length while keeping the call-to-action and merge tags intact.${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    case "lengthen":
      return `Expand this email — add 1-2 supporting paragraphs with concrete value (market context, what to expect, social proof). Do not pad.${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    case "tone": {
      const tone = b.tone ?? "professional";
      return `Rewrite this email in a ${tone} tone. Keep length and structure similar.${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    }
    case "translate": {
      const lang = b.targetLanguage ?? "en";
      const named: Record<string, string> = {
        en: "English",
        zh: "Simplified Chinese (中文)",
        ko: "Korean (한국어)",
        pa: "Punjabi (ਪੰਜਾਬੀ)",
      };
      return `Translate this email into ${named[lang] ?? lang}. Keep merge tokens in their original {{...}} / \${...} / {$...} form — DO NOT translate them.${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    }
    case "subject_lines":
      return `Generate 5 subject line variants for this email — each under 55 chars, no clickbait, no all-caps. Return as a JSON array under key "subjects".${subj}${prompt}${agent}\n\nHTML:\n${b.html ?? ""}`;
    case "generate":
      return `Write a brand-new presale real-estate email based on these notes. Use {{lead.first_name}}, {{sender.full_name}}, {{link.book_call}} where appropriate.${subj}\nNOTES: ${b.prompt ?? "Re-engage a cold lead about a new project launch."}${agent}`;
    case "search": {
      const cands = (b.candidates ?? []).slice(0, 80).map((c, i) =>
        `${i + 1}. [${c.kind}] id=${c.id} | ${c.name}${c.subject ? ` — ${c.subject}` : ""}${c.snippet ? `\n   ${c.snippet.slice(0, 140)}` : ""}`
      ).join("\n");
      return `A real-estate agent is looking for a template. Rank the most relevant template ids for this intent. Return at most 8 ids in order of relevance.\n\nINTENT: ${b.prompt ?? ""}\n\nCANDIDATES:\n${cands}`;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as AssistBody;
    if (!body?.mode) {
      return new Response(JSON.stringify({ error: "mode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI is not configured on this workspace yet." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const wantsSubjects = body.mode === "subject_lines";
    const wantsSearch = body.mode === "search";
    const messages = wantsSearch
      ? [
          { role: "system", content: "You match real-estate templates to an agent's intent. Always reply with a tool call." },
          { role: "user", content: buildUserPrompt(body) },
        ]
      : [
          { role: "system", content: body.format === "plain" ? SYSTEM_RULES_PLAIN : SYSTEM_RULES_HTML },
          { role: "user", content: buildUserPrompt(body) },
        ];

    const payload: Record<string, unknown> = {
      model: "google/gemini-3-flash-preview",
      messages,
    };

    if (wantsSubjects) {
      payload.tools = [{
        type: "function",
        function: {
          name: "return_subjects",
          description: "Return 5 subject line variants",
          parameters: {
            type: "object",
            properties: {
              subjects: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 7,
              },
            },
            required: ["subjects"],
            additionalProperties: false,
          },
        },
      }];
      payload.tool_choice = { type: "function", function: { name: "return_subjects" } };
    }

    if (wantsSearch) {
      payload.tools = [{
        type: "function",
        function: {
          name: "return_matches",
          description: "Return relevant template ids in ranked order with a brief reason for each.",
          parameters: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["id"],
                },
                maxItems: 8,
              },
            },
            required: ["matches"],
            additionalProperties: false,
          },
        },
      }];
      payload.tool_choice = { type: "function", function: { name: "return_matches" } };
    }

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (ai.status === 429) {
      return new Response(
        JSON.stringify({ error: "AI is busy right now — try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (ai.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI workspace credits exhausted. Add credits in Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!ai.ok) {
      const text = await ai.text();
      console.error("ai gateway error:", ai.status, text);
      return new Response(
        JSON.stringify({ error: "AI request failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await ai.json();

    if (wantsSubjects) {
      const call = data?.choices?.[0]?.message?.tool_calls?.[0];
      let subjects: string[] = [];
      try {
        const parsed = JSON.parse(call?.function?.arguments || "{}");
        subjects = Array.isArray(parsed?.subjects) ? parsed.subjects.slice(0, 7) : [];
      } catch (_) {
        subjects = [];
      }
      return new Response(JSON.stringify({ subjects }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (wantsSearch) {
      const call = data?.choices?.[0]?.message?.tool_calls?.[0];
      let matches: Array<{ id: string; reason?: string }> = [];
      try {
        const parsed = JSON.parse(call?.function?.arguments || "{}");
        matches = Array.isArray(parsed?.matches) ? parsed.matches.slice(0, 8) : [];
      } catch (_) {
        matches = [];
      }
      return new Response(JSON.stringify({ matches }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let out: string = data?.choices?.[0]?.message?.content ?? "";
    // Defensive cleanup — strip code fences the model occasionally adds.
    out = out.replace(/^```(html|text)?\s*/i, "").replace(/```$/i, "").trim();

    if (body.format === "plain") {
      return new Response(JSON.stringify({ text: out, body: out }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ html: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("template-ai-assist error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
