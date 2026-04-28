// crm-accept-invite — Public endpoint called from /accept-invite page.
// Validates the token, creates/updates the auth user with the chosen
// password (email pre-confirmed), and returns a one-time signin token so
// the client can establish a session immediately.
//
// Security: the invite token IS the proof of identity. Without a valid,
// pending, non-expired token, this function refuses the request. We never
// trust the email passed by the client — we use the email stored on the
// invite row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AcceptBody {
  token: string;
  password: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = (await req.json()) as AcceptBody;
    if (!body.token || !body.password) {
      return json({ error: "token and password are required" }, 400);
    }
    if (body.password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Validate token via the public RPC (anon-allowed)
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const { data: validation, error: vErr } = await anon.rpc("crm_team_validate_invite", {
      _token: body.token,
    });
    if (vErr) {
      console.error("validate_invite rpc error", vErr);
      return json({ error: "Could not validate invite" }, 500);
    }
    const v = validation as { valid: boolean; reason?: string; email?: string; display_name?: string };
    if (!v?.valid) {
      return json({ error: `Invite ${v?.reason ?? "invalid"}` }, 400);
    }

    const email = v.email!;
    const displayName = v.display_name!;

    // 2. Look up existing user by email; create if missing
    let userId: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) {
      userId = match.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: displayName },
      });
      if (updErr) {
        console.error("updateUserById failed", updErr);
        return json({ error: updErr.message }, 500);
      }
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: displayName },
      });
      if (createErr || !created?.user) {
        console.error("createUser failed", createErr);
        return json({ error: createErr?.message ?? "Could not create user" }, 500);
      }
      userId = created.user.id;
    }

    // 3. Sign the user in with the new password (server-side) so we can
    //    return tokens the client can use to establish a session.
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (signInErr || !signInData?.session) {
      console.error("signInWithPassword failed", signInErr);
      return json({ error: signInErr?.message ?? "Could not start session" }, 500);
    }

    // 4. Redeem the invite (links team row + approves workspace) using
    //    the freshly-issued user JWT so SECURITY DEFINER sees auth.uid().
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
      auth: { persistSession: false },
    });
    const { error: redeemErr } = await userClient.rpc("crm_team_redeem_invite", {
      _token: body.token,
    });
    if (redeemErr) {
      console.error("redeem_invite rpc failed", redeemErr);
      return json({ error: redeemErr.message }, 500);
    }

    return json({
      success: true,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      user_email: email,
    });
  } catch (e) {
    console.error("crm-accept-invite error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
