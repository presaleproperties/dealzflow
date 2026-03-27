import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const userId = user.id;
    console.log(`[DELETE-ACCOUNT] Deleting account for user: ${userId}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Tables in dependency order — must delete child records before parent
    const tables = [
      'payouts',
      'expenses',
      'expense_budgets',
      'pipeline_prospects',
      'deals',
      'other_income',
      'properties',
      'revenue_share',
      'network_agents',
      'network_summary',
      'synced_transactions',
      'sync_logs',
      'platform_connections',
      'chat_messages',
      'ai_usage',
      'admin_audit_logs',
      'user_roles',
      'settings',
      'profiles',
    ];

    const errors: string[] = [];

    // Wrap each deletion in its own try/catch so one failure doesn't abort others
    for (const table of tables) {
      try {
        // admin_audit_logs uses admin_user_id, not user_id for some rows
        if (table === 'admin_audit_logs') {
          await supabaseAdmin.from(table).delete().eq('target_user_id', userId);
          await supabaseAdmin.from(table).delete().eq('admin_user_id', userId);
        } else {
          const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
          if (error) {
            console.warn(`[DELETE-ACCOUNT] Warning deleting from ${table}: ${error.message}`);
            errors.push(`${table}: ${error.message}`);
          } else {
            console.log(`[DELETE-ACCOUNT] Deleted from ${table}`);
          }
        }
      } catch (tableErr) {
        const msg = tableErr instanceof Error ? tableErr.message : String(tableErr);
        console.warn(`[DELETE-ACCOUNT] Exception deleting from ${table}: ${msg}`);
        errors.push(`${table}: ${msg}`);
      }
    }

    // Delete the auth user — this is the critical step
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Failed to delete auth user: ${deleteError.message}`);
    }

    console.log(`[DELETE-ACCOUNT] Successfully deleted user ${userId}. Soft errors: ${errors.length}`);
    if (errors.length > 0) {
      console.warn(`[DELETE-ACCOUNT] Non-fatal errors during cleanup:`, errors);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DELETE-ACCOUNT] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
