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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) throw new Error("Unauthorized: Admin access required");

    const { action, targetUserId, name, email, banReason } = await req.json();

    if (!targetUserId) throw new Error("targetUserId is required");
    if (targetUserId === user.id) throw new Error("Cannot modify your own account via admin panel");

    // Helper: write an immutable audit log entry via service role
    const writeAuditLog = async (details?: Record<string, unknown>) => {
      await supabaseAdmin.from("admin_audit_logs").insert({
        admin_user_id: user.id,
        target_user_id: targetUserId,
        action,
        details: details ?? null,
        ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null,
      });
    };

    if (action === "delete") {
      // Delete all user data in dependency order
      const deletionTables = [
        'payouts', 'expenses', 'expense_budgets', 'pipeline_prospects', 'deals',
        'other_income', 'properties', 'revenue_share', 'network_agents', 'network_summary',
        'synced_transactions', 'sync_logs', 'platform_connections', 'chat_messages',
        'ai_usage', 'user_roles', 'settings', 'profiles',
      ];
      for (const table of deletionTables) {
        try {
          const { error } = await supabaseAdmin.from(table).delete().eq('user_id', targetUserId);
          if (error) console.warn(`[admin-delete] Warning for ${table}: ${error.message}`);
        } catch (e) {
          console.warn(`[admin-delete] Exception for ${table}:`, e);
        }
      }
      // Also remove audit logs targeting this user
      try {
        await supabaseAdmin.from('admin_audit_logs').delete().eq('target_user_id', targetUserId);
      } catch (_) { /* non-fatal */ }
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw new Error(`Failed to delete auth user: ${deleteError.message}`);
      await writeAuditLog();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reset_password") {
      // Get the user's email first
      const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (!authUserData?.user?.email) throw new Error("Could not find user email");
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
        authUserData.user.email,
        { redirectTo: `${req.headers.get("origin") || "https://commissioniq.lovable.app"}/reset-password` }
      );
      if (resetError) throw new Error(`Failed to send reset email: ${resetError.message}`);
      await writeAuditLog({ email: authUserData.user.email });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "ban" || action === "unban") {
      const isBanning = action === "ban";
      const { error: banError } = await supabaseAdmin
        .from("profiles")
        .update({
          is_banned: isBanning,
          banned_at: isBanning ? new Date().toISOString() : null,
          ban_reason: isBanning ? (banReason ?? null) : null,
        })
        .eq("user_id", targetUserId);
      if (banError) throw new Error(`Failed to ${action} user: ${banError.message}`);

      // Also disable/enable Supabase Auth login via admin API
      const { error: authBanError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: isBanning ? "876600h" : "none", // ~100 years = effectively permanent
      });
      if (authBanError) throw new Error(`Failed to update auth ban: ${authBanError.message}`);

      await writeAuditLog({ reason: banReason ?? null });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "edit") {
      if (!name && !email) throw new Error("name or email is required for edit");
      const changedFields: Record<string, unknown> = {};

      if (name) {
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update({ full_name: name.trim() })
          .eq("user_id", targetUserId);
        if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`);
        changedFields.name = name.trim();
      }

      if (email) {
        const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { email: email.trim() });
        if (emailError) throw new Error(`Failed to update email: ${emailError.message}`);
        changedFields.email = email.trim();
      }

      await writeAuditLog({ changed_fields: changedFields });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
