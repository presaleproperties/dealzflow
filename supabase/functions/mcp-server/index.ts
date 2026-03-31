import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: authenticate and return supabase client + userId
async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) throw new Error("Unauthorized");

  return { supabase, userId: data.claims.sub as string };
}

// Tool definitions
const TOOLS = [
  {
    name: "list_deals",
    description:
      "List all deals with client name, type, status, commissions, dates, and addresses. Returns up to 500 deals sorted by creation date.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["PENDING", "CLOSED"],
          description: "Filter by deal status (optional)",
        },
        limit: {
          type: "number",
          description: "Max records to return (default 100, max 500)",
        },
      },
    },
  },
  {
    name: "list_pipeline_prospects",
    description:
      "List pipeline prospects with client name, temperature (hot/warm/cold), status, deal type, budget, potential commission, and source.",
    inputSchema: {
      type: "object",
      properties: {
        temperature: {
          type: "string",
          enum: ["hot", "warm", "cold"],
          description: "Filter by temperature (optional)",
        },
        limit: {
          type: "number",
          description: "Max records to return (default 100, max 500)",
        },
      },
    },
  },
  {
    name: "list_expenses",
    description:
      "List expenses with category, amount, month, recurrence type, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Filter by month in YYYY-MM format (optional)",
        },
        limit: {
          type: "number",
          description: "Max records to return (default 100, max 500)",
        },
      },
    },
  },
  {
    name: "list_payouts",
    description:
      "List payouts with payout type, amount, status (PROJECTED/INVOICED/PAID), due date, and paid date.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["PROJECTED", "INVOICED", "PAID"],
          description: "Filter by payout status (optional)",
        },
        limit: {
          type: "number",
          description: "Max records to return (default 100, max 500)",
        },
      },
    },
  },
  {
    name: "get_summary",
    description:
      "Get a high-level summary: total deals, pipeline count, total GCI, pending commissions, expense totals, and payout breakdown.",
    inputSchema: { type: "object", properties: {} },
  },
];

// Tool handlers
async function handleTool(
  toolName: string,
  args: Record<string, any>,
  supabase: any
) {
  const limit = Math.min(args.limit || 100, 500);

  switch (toolName) {
    case "list_deals": {
      let query = supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "list_pipeline_prospects": {
      let query = supabase
        .from("pipeline_prospects")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.temperature)
        query = query.eq("temperature", args.temperature);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "list_expenses": {
      let query = supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.month) query = query.eq("month", args.month);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "list_payouts": {
      let query = supabase
        .from("payouts")
        .select("*, deal:deals(client_name, address)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "get_summary": {
      const [deals, prospects, expenses, payouts] = await Promise.all([
        supabase.from("deals").select("status, gross_commission_actual, gross_commission_est, net_commission_actual, net_commission_est"),
        supabase.from("pipeline_prospects").select("temperature, potential_commission, status"),
        supabase.from("expenses").select("amount, category"),
        supabase.from("payouts").select("amount, status"),
      ]);

      const dealData = deals.data || [];
      const prospectData = prospects.data || [];
      const expenseData = expenses.data || [];
      const payoutData = payouts.data || [];

      return {
        deals: {
          total: dealData.length,
          closed: dealData.filter((d: any) => d.status === "CLOSED").length,
          pending: dealData.filter((d: any) => d.status === "PENDING").length,
          total_gci_actual: dealData.reduce((s: number, d: any) => s + (d.gross_commission_actual || 0), 0),
          total_gci_estimated: dealData.reduce((s: number, d: any) => s + (d.gross_commission_est || 0), 0),
        },
        pipeline: {
          total: prospectData.length,
          hot: prospectData.filter((p: any) => p.temperature === "hot").length,
          warm: prospectData.filter((p: any) => p.temperature === "warm").length,
          cold: prospectData.filter((p: any) => p.temperature === "cold").length,
          total_potential: prospectData.reduce((s: number, p: any) => s + (p.potential_commission || 0), 0),
        },
        expenses: {
          total: expenseData.reduce((s: number, e: any) => s + (e.amount || 0), 0),
          count: expenseData.length,
        },
        payouts: {
          projected: payoutData.filter((p: any) => p.status === "PROJECTED").reduce((s: number, p: any) => s + p.amount, 0),
          invoiced: payoutData.filter((p: any) => p.status === "INVOICED").reduce((s: number, p: any) => s + p.amount, 0),
          paid: payoutData.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + p.amount, 0),
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// MCP JSON-RPC handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { method, params, id } = body;

    // MCP protocol methods
    switch (method) {
      case "initialize": {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: {
                name: "dealzflow-mcp",
                version: "1.0.0",
              },
            },
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      case "tools/list": {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { tools: TOOLS },
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      case "tools/call": {
        const { supabase } = await authenticate(req);
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        const result = await handleTool(toolName, toolArgs, supabase);

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      default: {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message === "Unauthorized" ? 401 : 500;

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: status === 401 ? -32000 : -32603, message },
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
