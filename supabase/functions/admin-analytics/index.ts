import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  
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

    // Create anon client with user's auth to verify identity
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      throw new Error("User not authenticated");
    }

    // Create admin client for privileged data access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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

    // Write audit log — admin viewed user list (fire-and-forget, don't block response)
    supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: user.id,
      target_user_id: null,
      action: "view_users",
      details: null,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null,
    }).then(
      () => {},
      (e: unknown) => console.warn("[audit] Failed to write log:", e)
    );

    // Fetch all profiles (including ban state)
    const { data: profiles, error: allProfilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, full_name, created_at, is_banned, banned_at, ban_reason");

    if (allProfilesError) {
      throw new Error(`Error fetching profiles: ${allProfilesError.message}`);
    }

    // Fetch all settings (for subscription data)
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("user_id, subscription_tier, subscription_started_at, subscription_ends_at, created_at, yearly_gci_goal, yearly_revshare_goal");

    if (settingsError) {
      throw new Error(`Error fetching settings: ${settingsError.message}`);
    }

    // Fetch deal counts per user
    const { data: deals, error: dealsError } = await supabaseAdmin
      .from("deals")
      .select("user_id, status, created_at");

    if (dealsError) {
      throw new Error(`Error fetching deals: ${dealsError.message}`);
    }

    // Fetch CRM contacts count
    const { count: totalCrmContacts, error: crmCountError } = await supabaseAdmin
      .from("crm_contacts")
      .select("id", { count: "exact", head: true });

    const { count: crmWithEmail, error: crmEmailError } = await supabaseAdmin
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .not("email", "is", null)
      .neq("email", "");

    const { count: crmWithPhone, error: crmPhoneError } = await supabaseAdmin
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .not("phone", "is", null)
      .neq("phone", "");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: crmRecent, error: crmRecentError } = await supabaseAdmin
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo);

    if (crmCountError) {
      console.warn("Error fetching CRM contacts count:", crmCountError.message);
    }

    // Get auth users for email info (using admin API)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    const authUsers = authError ? [] : authData.users;

    // Create a map of user_id to email
    const userEmailMap = new Map(
      authUsers.map((u: { id: string; email?: string }) => [u.id, u.email])
    );

    // Create a map of user_id to settings
    const settingsMap = new Map(
      settings?.map((s) => [s.user_id, s]) || []
    );

    // Create a map of user_id to deal counts
    const dealCountMap = new Map<string, { total: number; pending: number; closed: number }>();
    deals?.forEach((deal) => {
      const existing = dealCountMap.get(deal.user_id) || { total: 0, pending: 0, closed: 0 };
      existing.total++;
      if (deal.status === "PENDING") existing.pending++;
      if (deal.status === "CLOSED") existing.closed++;
      dealCountMap.set(deal.user_id, existing);
    });

    // Build user list with all data
    const users = profiles?.map((profile) => {
      const userSettings = settingsMap.get(profile.user_id);
      const userDeals = dealCountMap.get(profile.user_id) || { total: 0, pending: 0, closed: 0 };
      
      return {
        id: profile.user_id,
        name: profile.full_name || "Unknown",
        email: userEmailMap.get(profile.user_id) || "Unknown",
        createdAt: profile.created_at,
        subscriptionTier: userSettings?.subscription_tier || "free",
        subscriptionStartedAt: userSettings?.subscription_started_at,
        subscriptionEndsAt: userSettings?.subscription_ends_at,
        dealsCount: userDeals.total,
        pendingDeals: userDeals.pending,
        closedDeals: userDeals.closed,
        yearlyGciGoal: (userSettings as any)?.yearly_gci_goal || 0,
        yearlyRevshareGoal: (userSettings as any)?.yearly_revshare_goal || 0,
        isBanned: (profile as any).is_banned ?? false,
        bannedAt: (profile as any).banned_at ?? null,
        banReason: (profile as any).ban_reason ?? null,
      };
    }) || [];

    // Calculate summary metrics
    const totalUsers = users.length;
    const proUsers = users.filter((u) => u.subscriptionTier === "pro").length;
    const freeUsers = totalUsers - proUsers;
    const totalDeals = deals?.length || 0;
    const closedDeals = deals?.filter((d) => d.status === "CLOSED").length || 0;

    // Calculate signups by month (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const signupsByMonth: { month: string; count: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = monthDate.toISOString().slice(0, 7);
      const monthName = monthDate.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      const count = users.filter((u) => {
        const createdMonth = new Date(u.createdAt).toISOString().slice(0, 7);
        return createdMonth === monthStr;
      }).length;
      
      signupsByMonth.push({ month: monthName, count });
    }

    // Get recent signups (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentSignups = users.filter(
      (u) => new Date(u.createdAt) >= sevenDaysAgo
    ).length;

    // Calculate MRR (Monthly Recurring Revenue)
    const mrr = proUsers * 29; // $29/month per pro user

    // Get Stripe data if available
    let stripeRevenue = 0;
    let stripeSubscriptions = 0;
    
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        
        const subscriptions = await stripe.subscriptions.list({
          status: "active",
          limit: 100,
        });
        
        stripeSubscriptions = subscriptions.data.length;
        
        // Calculate actual MRR from Stripe
        stripeRevenue = subscriptions.data.reduce((acc: number, sub: Stripe.Subscription) => {
          const item = sub.items.data[0];
          if (item?.price?.unit_amount) {
            return acc + (item.price.unit_amount / 100);
          }
          return acc;
        }, 0);
      }
    } catch (stripeError) {
      console.error("Error fetching Stripe data:", stripeError);
    }

    return new Response(
      JSON.stringify({
        summary: {
          totalUsers,
          proUsers,
          freeUsers,
          totalDeals,
          closedDeals,
          recentSignups,
          mrr: stripeRevenue || mrr,
          activeSubscriptions: stripeSubscriptions || proUsers,
          crmContacts: totalCrmContacts ?? 0,
          crmWithEmail: crmWithEmail ?? 0,
          crmWithPhone: crmWithPhone ?? 0,
          crmRecent: crmRecent ?? 0,
        },
        signupsByMonth,
        users: users.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Admin analytics error:", error);
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
