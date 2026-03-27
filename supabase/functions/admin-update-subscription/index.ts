import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to identify the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    // Create service role client to verify user and check admin
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    // Check if user is admin via user_roles table
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      throw new Error("Unauthorized: Admin access required");
    }

    // Parse request body
    const { targetUserId, tier } = await req.json();

    if (!targetUserId || !tier) {
      throw new Error("Missing required fields: targetUserId, tier");
    }

    if (tier !== 'free' && tier !== 'pro') {
      throw new Error("Invalid tier. Must be 'free' or 'pro'");
    }

    // Update the user's subscription tier
    const updateData: Record<string, unknown> = {
      subscription_tier: tier,
    };

    if (tier === 'pro') {
      updateData.subscription_started_at = new Date().toISOString();
      // Set subscription to 1 year from now for manual upgrades
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      updateData.subscription_ends_at = oneYearFromNow.toISOString();
    } else {
      updateData.subscription_started_at = null;
      updateData.subscription_ends_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("settings")
      .update(updateData)
      .eq("user_id", targetUserId);

    if (updateError) {
      throw new Error(`Failed to update subscription: ${updateError.message}`);
    }

    console.log(`Admin ${user.email} updated user ${targetUserId} to tier: ${tier}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `User subscription updated to ${tier}` 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Admin update subscription error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
