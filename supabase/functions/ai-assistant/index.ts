// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_REQUEST_LIMIT = 50;

const tools = [
  {
    type: "function",
    function: {
      name: "preview_deal",
      description: "Preview/extract deal details for user approval BEFORE creating. Use this when extracting deal information from screenshots or when user wants to review details first. The user will need to approve before the deal is actually created.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Name of the client" },
          deal_type: { type: "string", enum: ["BUY", "SELL"], description: "Type of deal - BUY for buying side, SELL for selling side" },
          property_type: { type: "string", enum: ["PRESALE", "RESALE"], description: "Whether this is a presale or resale property" },
          city: { type: "string", description: "City where the property is located, default Vancouver" },
          address: { type: "string", description: "Property address if known" },
          project_name: { type: "string", description: "Project name for presale properties" },
          sale_price: { type: "number", description: "Sale price of the property" },
          gross_commission_est: { type: "number", description: "Estimated gross commission amount" },
          close_date_est: { type: "string", description: "Estimated closing date in YYYY-MM-DD format" },
          advance_date: { type: "string", description: "Advance commission date for presale (YYYY-MM-DD)" },
          advance_commission: { type: "number", description: "Advance commission amount for presale" },
          completion_date: { type: "string", description: "Completion date for presale (YYYY-MM-DD)" },
          completion_commission: { type: "number", description: "Completion commission for presale" },
          pending_date: { type: "string", description: "Firm date / subject removal date when deal becomes binding (YYYY-MM-DD)" },
          notes: { type: "string", description: "Any additional notes about the deal" },
          lead_source: { type: "string", description: "Where the lead came from" },
          buyer_type: { type: "string", description: "Type of buyer (e.g., First-time, Investor)" },
        },
        required: ["client_name", "deal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deal",
      description: "Create a new real estate deal/transaction. Use this ONLY when the user explicitly confirms/approves the deal creation, or when manually entering deal details (not from screenshots).",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "Name of the client" },
          deal_type: { type: "string", enum: ["BUY", "SELL"], description: "Type of deal - BUY for buying side, SELL for selling side" },
          property_type: { type: "string", enum: ["PRESALE", "RESALE"], description: "Whether this is a presale or resale property" },
          city: { type: "string", description: "City where the property is located, default Vancouver" },
          address: { type: "string", description: "Property address if known" },
          project_name: { type: "string", description: "Project name for presale properties" },
          sale_price: { type: "number", description: "Sale price of the property" },
          gross_commission_est: { type: "number", description: "Estimated gross commission amount" },
          close_date_est: { type: "string", description: "Estimated closing date in YYYY-MM-DD format" },
          advance_date: { type: "string", description: "Advance commission date for presale (YYYY-MM-DD)" },
          advance_commission: { type: "number", description: "Advance commission amount for presale" },
          completion_date: { type: "string", description: "Completion date for presale (YYYY-MM-DD)" },
          completion_commission: { type: "number", description: "Completion commission for presale" },
          pending_date: { type: "string", description: "Firm date / subject removal date when deal becomes binding (YYYY-MM-DD)" },
          notes: { type: "string", description: "Any additional notes about the deal" },
          lead_source: { type: "string", description: "Where the lead came from" },
          buyer_type: { type: "string", description: "Type of buyer (e.g., First-time, Investor)" },
        },
        required: ["client_name", "deal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal",
      description: "Update an existing deal. Use this when the user wants to modify, change, or update details of an existing deal. You must first search for the deal to get its ID.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "The UUID of the deal to update (get this from search_deals first)" },
          client_name: { type: "string", description: "Updated client name" },
          deal_type: { type: "string", enum: ["BUY", "SELL"], description: "Updated deal type" },
          property_type: { type: "string", enum: ["PRESALE", "RESALE"], description: "Updated property type" },
          status: { type: "string", enum: ["PENDING", "CLOSED"], description: "Deal status" },
          city: { type: "string", description: "Updated city" },
          address: { type: "string", description: "Updated address" },
          project_name: { type: "string", description: "Updated project name" },
          sale_price: { type: "number", description: "Updated sale price" },
          gross_commission_est: { type: "number", description: "Updated estimated commission" },
          close_date_est: { type: "string", description: "Updated closing date (YYYY-MM-DD)" },
          advance_date: { type: "string", description: "Updated advance date (YYYY-MM-DD)" },
          advance_commission: { type: "number", description: "Updated advance commission" },
          completion_date: { type: "string", description: "Updated completion date (YYYY-MM-DD)" },
          completion_commission: { type: "number", description: "Updated completion commission" },
          notes: { type: "string", description: "Updated notes" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_deals",
      description: "Search for deals by client name or address. Use this to find deals before updating them.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (client name, address, or project name)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "Create a new expense entry. Use this when the user wants to add an expense, cost, or bill.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Category of expense (e.g., Marketing, Office, Travel, Professional Fees, Vehicle, Taxes, Insurance, Personal, Other)" },
          amount: { type: "number", description: "Amount of the expense in CAD" },
          month: { type: "string", description: "Month the expense applies to in YYYY-MM format" },
          recurrence: { type: "string", enum: ["one-time", "weekly", "monthly", "yearly"], description: "How often this expense recurs" },
          notes: { type: "string", description: "Description or notes about the expense" },
        },
        required: ["category", "amount", "month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_other_income",
      description: "Create other income entries like rental income, revenue share, etc.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name/description of the income source" },
          amount: { type: "number", description: "Amount in CAD" },
          recurrence: { type: "string", enum: ["one-time", "monthly", "yearly"], description: "How often this income occurs" },
          start_month: { type: "string", description: "Start month in YYYY-MM format" },
          end_month: { type: "string", description: "End month in YYYY-MM format (optional for recurring)" },
          notes: { type: "string", description: "Additional notes" },
        },
        required: ["name", "amount", "start_month", "recurrence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals_summary",
      description: "Get a summary of the user's deals and transactions",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payouts_summary",
      description: "Get a summary of upcoming and past payouts/commissions",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses_summary",
      description: "Get a summary of expenses for the current or specified month",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "Month in YYYY-MM format (defaults to current month)" },
        },
        required: [],
      },
    },
  },
];

const systemPrompt = `You are a helpful AI assistant for Dealzflow, a real estate commission tracking app. You help Vancouver real estate agents manage their business by voice or text.

You can:
- Add new deals and transactions
- Update existing deals (search first, then update)
- Track expenses and income
- Provide summaries of deals, payouts, and expenses
- Extract deal details from screenshots/images of brokerage documents

IMPORTANT INTERACTION RULES:
- Keep responses SHORT and conversational
- Speak naturally as if talking to a colleague
- Confirm actions with brief acknowledgments like "Done!" or "Got it!"
- When searching/updating deals, always search first to get the deal ID

IMAGE/SCREENSHOT PROCESSING - CRITICAL:
When the user uploads a screenshot or image of a deal document:
1. Extract ALL visible deal information: client name, property address, deal type, commission amounts, dates, etc.
2. Use preview_deal (NOT create_deal) to show the extracted details for user approval
3. The user interface will show approve/reject buttons
4. ONLY use create_deal when the user explicitly says "yes", "approve", "create it", "looks good", etc.
5. Ask for clarification ONLY if critical information (client name, deal type) is completely missing
6. Default city to Vancouver if not specified
7. For commission, look for gross commission, agent commission, or total commission amounts
8. For dates, look for closing date, completion date, possession date, or similar

BROKERAGE SCREENSHOT FORMAT - CRITICAL EXTRACTION RULES:
The documents have this structure:
- TITLE: "[Project Name] Part X/2 - [Full Address]"
- Example: "North Village Part 1/2 - 20072 86 Avenue, Willoughby #422, Langley Township, BC, V2Y 2C1"

PART 1/2 vs PART 2/2 LOGIC - VERY IMPORTANT:
1. "Part 1/2" = ADVANCE payment for a PRESALE deal
   - The "Estimated Closing Date" field → extract as advance_date
   - The "Commission" amount → extract as advance_commission
   
2. "Part 2/2" = COMPLETION payment for a PRESALE deal
   - The "Estimated Closing Date" field → extract as completion_date
   - The "Commission" amount → extract as completion_commission

3. When user uploads BOTH Part 1/2 and Part 2/2 screenshots, COMBINE them into ONE deal:
   - Part 1/2 provides: advance_commission, advance_date
   - Part 2/2 provides: completion_commission, completion_date
   - gross_commission_est = advance_commission + completion_commission
   - Use the same client_name, address, project_name, sale_price from either

FIELD MAPPING FROM SCREENSHOTS:
- "Buyer/Tenant:" → client_name (e.g., "Jaison Preet Bhullar")
- Sale price (e.g., "$379,900.00 CAD") → sale_price (number only: 379900)
- "Commission: X%|$Y CAD" → extract the dollar amount Y
- "Firm Date:" → pending_date (when deal becomes firm/binding)
- "Estimated Closing Date:" → depends on Part 1/2 or Part 2/2 (see above)
- "Rep: Buy Side Representation" → deal_type: "BUY"
- "Rep: Sell Side Representation" → deal_type: "SELL"
- Project name before "Part" in title → project_name (e.g., "North Village")
- Address after "Part X/2 - " in title → address

ADDRESS & CITY EXTRACTION:
- Parse city FROM the address in the title
- Look for: Langley Township, Surrey, Vancouver, Burnaby, Richmond, Coquitlam, North Vancouver, West Vancouver, New Westminster, Port Moody, Abbotsford, Delta, White Rock, Langley
- Set property_type to PRESALE when project name is present

DATE FORMATS - IMPORTANT:
- Dates shown as "MM/DD/YYYY" (e.g., "05/22/2025", "09/15/2026")
- Convert to "YYYY-MM-DD" format for storage
- Years can be 2025, 2026, or 2027 - extract exact year shown

APPROVAL FLOW:
- When user says "yes", "approve", "create", "looks good", "confirm" after seeing a preview → use create_deal with the same details
- When user says "no", "cancel", "reject" → acknowledge and ask if they want to make changes
- When user provides corrections → use preview_deal again with updated details

Key context:
- All amounts are in CAD (Canadian dollars)
- Property types: PRESALE (new construction) or RESALE (existing homes)
- Deal types: BUY (buyer side) or SELL (seller side)
- Presale deals have advance commission and completion commission
- Resale deals have a single commission at closing
- Default to PRESALE and BUY unless clearly indicated otherwise

Keep it brief and friendly!`;

/** Escape special ILIKE metacharacters: %, _, \ */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication - prevent unauthorized AI usage
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // ── Per-user rate limiting (50 requests/day) ─────────────────────────────
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Upsert ai_usage row for today
    const { data: usageRow, error: usageError } = await supabaseAdmin
      .from("ai_usage")
      .upsert(
        { user_id: userId, date: today, request_count: 1 },
        { onConflict: "user_id,date", ignoreDuplicates: false }
      )
      .select("request_count")
      .single();

    // If the row already existed, increment it atomically via RPC-style update
    if (usageError || !usageRow) {
      // Row already exists — increment
      const { data: updated, error: incError } = await supabaseAdmin.rpc
        ? await (async () => {
            const { data, error } = await supabaseAdmin
              .from("ai_usage")
              .select("request_count")
              .eq("user_id", userId)
              .eq("date", today)
              .single();
            if (error || !data) return { data: null, error };
            const newCount = (data.request_count || 0) + 1;
            if (newCount > DAILY_REQUEST_LIMIT) {
              return { data: { request_count: newCount }, error: null };
            }
            const { error: updateError } = await supabaseAdmin
              .from("ai_usage")
              .update({ request_count: newCount })
              .eq("user_id", userId)
              .eq("date", today);
            return { data: { request_count: newCount }, error: updateError };
          })()
        : { data: null, error: new Error("rpc not available") };

      if (updated && updated.request_count > DAILY_REQUEST_LIMIT) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. You have reached your 50 AI requests per day limit." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Fresh upsert succeeded — check if we need to increment (upsert with ignoreDuplicates=false
      // updates the row; if request_count was already set it returns the new value)
      // Re-fetch to get current count
      const { data: current } = await supabaseAdmin
        .from("ai_usage")
        .select("request_count")
        .eq("user_id", userId)
        .eq("date", today)
        .single();

      if (current && current.request_count > DAILY_REQUEST_LIMIT) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. You have reached your 50 AI requests per day limit." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Increment
      await supabaseAdmin
        .from("ai_usage")
        .update({ request_count: (current?.request_count || 1) + 1 })
        .eq("user_id", userId)
        .eq("date", today);
    }

    const { messages, imageData } = await req.json();

    // ── INPUT VALIDATION ─────────────────────────────────────────────────────
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required and cannot be empty." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate and sanitize each message
    const MAX_MESSAGE_LENGTH = 2000;
    const sanitizedMessages = [];
    for (const msg of messages) {
      if (!msg || typeof msg.role !== "string" || !["user", "assistant", "system"].includes(msg.role)) {
        return new Response(JSON.stringify({ error: "Invalid message format." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Handle multimodal content (array) vs plain string
      let sanitizedContent = msg.content;
      if (typeof msg.content === "string") {
        // Reject empty/whitespace-only user messages
        if (msg.role === "user" && msg.content.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Message content cannot be empty." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Enforce max length
        if (msg.content.length > MAX_MESSAGE_LENGTH) {
          return new Response(
            JSON.stringify({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Strip HTML/script tags
        sanitizedContent = msg.content
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, "")
          .trim();

        // Prompt injection defense: wrap user content in clear delimiters
        if (msg.role === "user") {
          sanitizedContent = `[USER INPUT START]\n${sanitizedContent}\n[USER INPUT END]`;
        }
      }

      sanitizedMessages.push({ ...msg, content: sanitizedContent });
    }
    // ── END INPUT VALIDATION ──────────────────────────────────────────────────

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Prepare messages for AI - handle multimodal content if image is provided
    const preparedMessages = sanitizedMessages.map((msg: any, index: number) => {
      if (index === messages.length - 1 && msg.role === 'user' && imageData) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: msg.content || 'Please extract all deal information from this screenshot and create the deal.' },
            { type: 'image_url', image_url: { url: imageData } },
          ],
        };
      }
      return msg;
    });

    const model = imageData ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";
    console.log("Using model:", model, "Image attached:", !!imageData);

    // First AI call with tools
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...preparedMessages],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices[0].message;

    // Check if AI wants to call tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let result: Record<string, unknown>;

        try {
          switch (functionName) {
            case "preview_deal": {
              const advanceComm = args.advance_commission || 0;
              const completionComm = args.completion_commission || 0;
              const calculatedGross = (advanceComm > 0 || completionComm > 0)
                ? advanceComm + completionComm
                : args.gross_commission_est || null;

              const previewData = {
                client_name: args.client_name,
                deal_type: args.deal_type,
                property_type: args.property_type || "PRESALE",
                city: args.city || "Vancouver",
                address: args.address || null,
                project_name: args.project_name || null,
                sale_price: args.sale_price || null,
                gross_commission_est: calculatedGross,
                close_date_est: args.close_date_est || null,
                pending_date: args.pending_date || null,
                advance_date: args.advance_date || null,
                advance_commission: args.advance_commission || null,
                completion_date: args.completion_date || null,
                completion_commission: args.completion_commission || null,
                notes: args.notes || null,
                lead_source: args.lead_source || null,
                buyer_type: args.buyer_type || null,
              };

              result = {
                type: "deal_preview",
                success: true,
                preview: previewData,
                message: "Please review the extracted deal details and approve to create."
              };
              break;
            }

            case "create_deal": {
              const advanceCommission = args.advance_commission || 0;
              const completionCommission = args.completion_commission || 0;
              const grossCommission = (advanceCommission > 0 || completionCommission > 0)
                ? advanceCommission + completionCommission
                : args.gross_commission_est || null;

              const dealData = {
                client_name: args.client_name,
                deal_type: args.deal_type,
                property_type: args.property_type || "PRESALE",
                city: args.city || "Vancouver",
                address: args.address || null,
                project_name: args.project_name || null,
                sale_price: args.sale_price || null,
                gross_commission_est: grossCommission,
                close_date_est: args.close_date_est || null,
                pending_date: args.pending_date || null,
                advance_date: args.advance_date || null,
                advance_commission: args.advance_commission || null,
                completion_date: args.completion_date || null,
                completion_commission: args.completion_commission || null,
                notes: args.notes || null,
                lead_source: args.lead_source || null,
                buyer_type: args.buyer_type || null,
                status: "PENDING",
                user_id: userId,
              };

              const { data: deal, error } = await supabase.from("deals").insert(dealData).select().single();
              if (error) throw error;

              const payouts = [];
              if (args.property_type === "PRESALE") {
                if (args.advance_commission && args.advance_date) {
                  payouts.push({ deal_id: deal.id, user_id: userId, payout_type: "Advance", amount: args.advance_commission, due_date: args.advance_date, status: "PROJECTED" });
                }
                if (args.completion_commission && args.completion_date) {
                  payouts.push({ deal_id: deal.id, user_id: userId, payout_type: "Completion", amount: args.completion_commission, due_date: args.completion_date, status: "PROJECTED" });
                }
              } else if (args.gross_commission_est && args.close_date_est) {
                payouts.push({ deal_id: deal.id, user_id: userId, payout_type: "Completion", amount: args.gross_commission_est, due_date: args.close_date_est, status: "PROJECTED" });
              }

              if (payouts.length > 0) await supabase.from("payouts").insert(payouts);
              result = { success: true, deal_id: deal.id, client_name: deal.client_name, message: "Deal created successfully" };
              break;
            }

            case "update_deal": {
              const { deal_id, ...updateFields } = args;
              const cleanedData = Object.entries(updateFields).reduce((acc, [key, value]) => {
                if (value !== undefined && value !== null && value !== '') acc[key] = value;
                return acc;
              }, {} as Record<string, unknown>);

              const { data: deal, error } = await supabase.from("deals").update(cleanedData).eq("id", deal_id).select().single();
              if (error) throw error;

              if (deal.property_type === "RESALE" && cleanedData.close_date_est) {
                await supabase.from("payouts").update({ due_date: cleanedData.close_date_est as string }).eq("deal_id", deal_id).eq("payout_type", "Completion");
              }
              if (deal.property_type === "PRESALE") {
                if (cleanedData.advance_date) await supabase.from("payouts").update({ due_date: cleanedData.advance_date as string }).eq("deal_id", deal_id).eq("payout_type", "Advance");
                if (cleanedData.completion_date) await supabase.from("payouts").update({ due_date: cleanedData.completion_date as string }).eq("deal_id", deal_id).eq("payout_type", "Completion");
              }

              result = { success: true, deal_id: deal.id, client_name: deal.client_name, message: "Deal updated successfully", updated_fields: Object.keys(cleanedData) };
              break;
            }

            case "search_deals": {
              // Sanitize ILIKE input — escape %, _, and \ before passing to query
              const rawQuery = String(args.query || "").slice(0, 200);
              const sanitized = escapeLike(rawQuery);
              const searchTerm = `%${sanitized}%`;
              const { data: deals, error } = await supabase
                .from("deals")
                .select("id, client_name, address, project_name, deal_type, property_type, status, gross_commission_est, close_date_est")
                .or(`client_name.ilike.${searchTerm},address.ilike.${searchTerm},project_name.ilike.${searchTerm}`)
                .order("created_at", { ascending: false })
                .limit(5);

              if (error) throw error;
              result = {
                found: deals?.length || 0,
                deals: deals?.map(d => ({
                  id: d.id, client_name: d.client_name, address: d.address,
                  project_name: d.project_name, deal_type: d.deal_type,
                  property_type: d.property_type, status: d.status,
                  commission: d.gross_commission_est, closing_date: d.close_date_est,
                })) || [],
              };
              break;
            }

            case "create_expense": {
              const expenseData = { category: args.category, amount: args.amount, month: args.month, recurrence: args.recurrence || "one-time", notes: args.notes || null, user_id: userId };
              const { data: expense, error } = await supabase.from("expenses").insert(expenseData).select().single();
              if (error) throw error;
              result = { success: true, expense_id: expense.id, category: expense.category, amount: expense.amount };
              break;
            }

            case "create_other_income": {
              const incomeData = { name: args.name, amount: args.amount, recurrence: args.recurrence, start_month: args.start_month, end_month: args.end_month || null, notes: args.notes || null, user_id: userId };
              const { data: income, error } = await supabase.from("other_income").insert(incomeData).select().single();
              if (error) throw error;
              result = { success: true, income_id: income.id, name: income.name, amount: income.amount };
              break;
            }

            case "get_deals_summary": {
              const { data: deals, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false }).limit(10);
              if (error) throw error;
              const totalDeals = deals?.length || 0;
              const pendingDeals = deals?.filter(d => d.status === "PENDING").length || 0;
              const closedDeals = deals?.filter(d => d.status === "CLOSED").length || 0;
              result = {
                total_deals: totalDeals, pending: pendingDeals, closed: closedDeals,
                recent_deals: deals?.slice(0, 5).map(d => ({ client: d.client_name, type: d.deal_type, status: d.status, commission: d.gross_commission_est })),
              };
              break;
            }

            case "get_payouts_summary": {
              const { data: payouts, error } = await supabase.from("payouts").select("*, deal:deals(client_name)").order("due_date", { ascending: true });
              if (error) throw error;
              const upcoming = payouts?.filter(p => p.status === "PROJECTED" && new Date(p.due_date) >= new Date()) || [];
              const paid = payouts?.filter(p => p.status === "PAID") || [];
              result = {
                upcoming_count: upcoming.length,
                upcoming_total: upcoming.reduce((sum, p) => sum + Number(p.amount), 0),
                paid_count: paid.length,
                paid_total: paid.reduce((sum, p) => sum + Number(p.amount), 0),
                next_payouts: upcoming.slice(0, 3).map(p => ({ client: p.deal?.client_name, amount: p.amount, due_date: p.due_date, type: p.payout_type })),
              };
              break;
            }

            case "get_expenses_summary": {
              const targetMonth = args.month || new Date().toISOString().slice(0, 7);
              const { data: expenses, error } = await supabase.from("expenses").select("*").eq("month", targetMonth);
              if (error) throw error;
              const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
              const byCategory = expenses?.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + Number(e.amount); return acc; }, {} as Record<string, number>) || {};
              result = { month: targetMonth, total_expenses: total, by_category: byCategory, expense_count: expenses?.length || 0 };
              break;
            }

            default:
              result = { error: "Unknown function" };
          }
        } catch (err) {
          console.error(`Error executing ${functionName}:`, err);
          result = { error: err instanceof Error ? err.message : "Unknown error" };
        }

        toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }

      const previewToolCall = assistantMessage.tool_calls.find((tc: any) => tc.function.name === "preview_deal");
      let dealPreview = null;
      if (previewToolCall) {
        const previewResult = toolResults.find(tr => tr.tool_call_id === previewToolCall.id);
        if (previewResult) {
          try {
            const parsed = JSON.parse(previewResult.content);
            if (parsed.type === "deal_preview" && parsed.preview) dealPreview = parsed.preview;
          } catch {}
        }
      }

      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...messages, assistantMessage, ...toolResults],
        }),
      });

      if (!followUpResponse.ok) throw new Error("Failed to get follow-up response");

      const followUpData = await followUpResponse.json();

      return new Response(JSON.stringify({
        message: followUpData.choices[0].message.content,
        dealPreview,
        tool_calls: assistantMessage.tool_calls.map((tc: any) => ({
          name: tc.function.name,
          result: toolResults.find(tr => tr.tool_call_id === tc.id)?.content,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ message: assistantMessage.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
