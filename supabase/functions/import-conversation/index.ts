// Parse raw pasted Lofty (or any CRM) conversation text into structured messages
// using Lovable AI tool-calling. Returns the messages + a short summary.
//
// Body: { raw_text: string, contact_id?: string }
// Returns: { messages: Message[], summary: string }
//
// Message = {
//   channel: 'email' | 'sms' | 'whatsapp' | 'call' | 'voicemail' | 'chat',
//   direction: 'inbound' | 'outbound',
//   timestamp: string | null,        // ISO
//   from?: string,
//   to?: string,
//   subject?: string,
//   body: string,
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SYSTEM_PROMPT = `You are an expert CRM conversation parser. Given raw pasted text from another CRM (typically Lofty), you extract every distinct message in chronological order.

Return ONE call to the "extract_messages" tool with a list of messages.

For each message, identify:
- channel: "email" | "sms" | "whatsapp" | "call" | "voicemail" | "chat"
- direction: "inbound" (from the lead) or "outbound" (from the agent/team)
- timestamp: ISO 8601 string in UTC if you can confidently parse a date/time, otherwise null. Preserve the order even when timestamps are missing.
- from / to: free-text (name or email or phone) when present
- subject: only for emails
- body: the cleaned message body. Strip quoted reply chains, signatures, and tracking footers. Keep line breaks.

Also produce a short (2-4 sentence) plain-text summary of what happened across the whole thread, focused on intent, outcomes, and next steps.

Rules:
- Never invent messages. If the text is empty or non-conversational, return an empty messages array.
- If a single email contains a quoted prior reply, split it into two messages (the new reply + the quoted one with appropriate direction).
- Treat "Sent:", "From:", ">", "On <date> ... wrote:" as message boundaries.
- For call logs / voicemails, the body should be the notes or transcript.
- Output messages oldest-first.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "extract_messages",
    description: "Return the parsed conversation messages and a short summary.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        messages: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              channel: { type: "string", enum: ["email", "sms", "whatsapp", "call", "voicemail", "chat"] },
              direction: { type: "string", enum: ["inbound", "outbound"] },
              timestamp: { type: ["string", "null"] },
              from: { type: ["string", "null"] },
              to: { type: ["string", "null"] },
              subject: { type: ["string", "null"] },
              body: { type: "string" },
            },
            required: ["channel", "direction", "timestamp", "from", "to", "subject", "body"],
          },
        },
      },
      required: ["summary", "messages"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Authenticate caller (we only need to verify; insertion happens client-side under RLS)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supa = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { raw_text } = await req.json();
    if (typeof raw_text !== "string" || raw_text.trim().length < 5) {
      return new Response(JSON.stringify({ error: "raw_text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (raw_text.length > 60000) {
      return new Response(JSON.stringify({ error: "Pasted text is too long (max 60,000 characters). Please split it." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Raw conversation text to parse:\n\n${raw_text}` },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_messages" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "AI rate limit reached. Please wait a moment and retry." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI workspace credits exhausted. Add funds in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments || "{}");
    const messages = Array.isArray(args.messages) ? args.messages : [];
    const summary = typeof args.summary === "string" ? args.summary : "";

    return new Response(JSON.stringify({ messages, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-conversation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
