// @ts-nocheck
// Per-user Gmail OAuth: connect, disconnect, status, refresh.
// Reuses GOOGLE_CALENDAR_CLIENT_ID/SECRET (same Google Cloud OAuth app).
// Add gmail.readonly + gmail.send + gmail.modify scopes to the consent screen.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeOAuthState, decodeOAuthState } from "../_shared/oauthState.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
// Read inbox + send + modify (mark read/archive). All three scopes.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return json({ error: "OAuth credentials not configured" }, 500);
  }

  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-auth`;

  try {
    const url = new URL(req.url);

    // ── OAuth callback ──────────────────────────────────────────────────
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      const parsed = await decodeOAuthState(state);
      const back = parsed?.redirectUrl ?? "/";
      return Response.redirect(
        `${back}?gmail_auth=error&message=${encodeURIComponent(oauthError)}`,
        302,
      );
    }

    if (code && state) {
      const parsed = await decodeOAuthState(state);
      if (!parsed) return json({ error: "Invalid state" }, 400);

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("Gmail token exchange failed:", tokens);
        return Response.redirect(
          `${parsed.redirectUrl}?gmail_auth=error&message=${encodeURIComponent("Token exchange failed")}`,
          302,
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      const { data: existing } = await supabase
        .from("gmail_tokens")
        .select("refresh_token")
        .eq("user_id", parsed.userId)
        .maybeSingle();

      const refreshToken = tokens.refresh_token || existing?.refresh_token;
      if (!refreshToken) {
        return Response.redirect(
          `${parsed.redirectUrl}?gmail_auth=error&message=${encodeURIComponent("No refresh token. Revoke app in Google Account and reconnect.")}`,
          302,
        );
      }

      let gmailEmail: string | null = null;
      try {
        const infoRes = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const info = await infoRes.json();
        gmailEmail = info.email ?? null;
      } catch {/* non-critical */}

      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      const { error: dbErr } = await supabase
        .from("gmail_tokens")
        .upsert({
          user_id: parsed.userId,
          access_token: tokens.access_token,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
          gmail_email: gmailEmail,
        }, { onConflict: "user_id" });

      if (dbErr) {
        console.error("gmail_tokens upsert error:", dbErr);
        return Response.redirect(
          `${parsed.redirectUrl}?gmail_auth=error&message=${encodeURIComponent("Failed to save tokens")}`,
          302,
        );
      }

      // Initialize sync state
      await supabase.from("crm_gmail_sync_state").upsert({
        user_id: parsed.userId,
        initial_sync_started_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Kick off initial sync in the background (fire-and-forget)
      fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ user_id: parsed.userId, full: true }),
      }).catch(e => console.error("Initial sync trigger failed:", e));

      return Response.redirect(`${parsed.redirectUrl}?gmail_auth=success`, 302);
    }

    // ── POST: actions ───────────────────────────────────────────────────
    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

      const supabaseUser = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) return json({ error: "Unauthorized" }, 401);
      const userId = user.id;

      const body = await req.json();
      const action = body.action;

      if (action === "get_auth_url") {
        const redirectUrl = body.redirectUrl || "https://commissioniq.lovable.app/crm/email";
        const stateData = btoa(JSON.stringify({ userId, redirectUrl }));
        const loginHint = (typeof body.loginHint === "string" && body.loginHint.trim()) || user.email || "";

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(CLIENT_ID)}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(SCOPES)}` +
          `&access_type=offline` +
          `&include_granted_scopes=true` +
          `&prompt=${encodeURIComponent("consent select_account")}` +
          (loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : "") +
          `&state=${encodeURIComponent(stateData)}`;

        return json({ authUrl });
      }

      if (action === "disconnect") {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supabase.from("gmail_tokens").delete().eq("user_id", userId);
        await supabase.from("crm_gmail_sync_state").delete().eq("user_id", userId);
        return json({ success: true });
      }

      if (action === "status") {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data: tokenRow } = await supabase
          .from("gmail_tokens")
          .select("gmail_email, token_expires_at")
          .eq("user_id", userId)
          .maybeSingle();
        const { data: syncRow } = await supabase
          .from("crm_gmail_sync_state")
          .select("initial_sync_completed, last_sync_at, total_messages_synced, last_error, watch_expires_at")
          .eq("user_id", userId)
          .maybeSingle();

        return json({
          connected: !!tokenRow,
          gmailEmail: tokenRow?.gmail_email ?? null,
          sync: syncRow ?? null,
        });
      }

      return json({ error: "Unknown action" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("gmail-auth error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
