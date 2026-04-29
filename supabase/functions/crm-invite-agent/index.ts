// crm-invite-agent — Admin sends an invite to a future agent.
// 1. Calls crm_team_create_invite RPC (admin-gated) to mint a token.
// 2. Builds a branded "Set Password" email and sends via bridge-send-email
//    (which proxies to Presale's Gmail SMTP, no domain setup required).
// 3. Returns the public accept URL so the UI can show / copy it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteBody {
  email: string;
  display_name: string;
  role?: "agent" | "admin" | "viewer";
  app_origin?: string; // optional override; defaults to https://dealzflow.ca
  personal_note?: string | null;
  /**
   * "set_password" (default, legacy): user gets a link, picks their own password.
   * "temp_password": admin generates a temp password, account is created
   *   immediately, user is forced to change it on first login.
   */
  mode?: "set_password" | "temp_password";
}

const DEFAULT_APP_ORIGIN = "https://dealzflow.ca";

// Generates a memorable but strong temp password: Word-Word-#### (e.g. "Falcon-River-4827")
function generateTempPassword(): string {
  const adjectives = ["Falcon", "River", "Maple", "Cedar", "Harbor", "Summit", "Aspen", "Quartz", "Bronze", "Ember", "Stellar", "Cobalt"];
  const nouns = ["Trail", "Ridge", "Cove", "Grove", "Peak", "Field", "Lake", "Bay", "Vale", "Pier"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const b = nouns[Math.floor(Math.random() * nouns.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${b}-${n}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInviteEmail(opts: {
  inviterName: string;
  recipientName: string;
  acceptUrl: string;
  expiresAt: string;
  personalNote?: string | null;
}): { subject: string; html: string } {
  const safeRecipient = escapeHtml(opts.recipientName.split(" ")[0] || "there");
  const safeInviter = escapeHtml(opts.inviterName);
  const safeUrl = escapeHtml(opts.acceptUrl);
  const expiresHuman = new Date(opts.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const noteBlock = opts.personalNote && opts.personalNote.trim()
    ? `<tr><td style="padding:0 0 24px 0;">
        <div style="background:#fafafa;border-left:3px solid #D7A542;padding:14px 18px;border-radius:4px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:6px;">A note from ${safeInviter}</div>
          <div style="font-size:14px;color:#333;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.personalNote)}</div>
        </div>
      </td></tr>`
    : "";

  const subject = `${opts.inviterName} invited you to Dealz Flow`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 20px 40px;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#D7A542;">Dealz Flow</div>
              <div style="font-size:22px;font-weight:700;color:#14181F;margin-top:6px;">You're invited to the team</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 40px 8px 40px;font-size:15px;color:#333;line-height:1.6;">
              Hi ${safeRecipient},
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;font-size:15px;color:#333;line-height:1.6;">
              ${safeInviter} has invited you to join Dealz Flow — your CRM and deals workspace.
              Click the button below to set your password and get started.
            </td>
          </tr>
          ${noteBlock}
          <!-- CTA -->
          <tr>
            <td align="center" style="padding:8px 40px 32px 40px;">
              <a href="${safeUrl}"
                 style="display:inline-block;background:#D7A542;color:#14181F;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.01em;">
                Set your password →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px 40px;font-size:13px;color:#777;line-height:1.6;text-align:center;">
              Or copy and paste this link into your browser:<br/>
              <span style="color:#555;word-break:break-all;">${safeUrl}</span>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px 40px;border-top:1px solid #f0f0f0;font-size:12px;color:#999;line-height:1.55;">
              This invitation expires on <strong>${expiresHuman}</strong>. If you weren't expecting this, you can safely ignore this email.
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#bbb;margin-top:18px;">Dealz Flow · Powered by Presale Properties</div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function buildTempPasswordEmail(opts: {
  inviterName: string;
  recipientName: string;
  loginUrl: string;
  email: string;
  tempPassword: string;
  personalNote?: string | null;
}): { subject: string; html: string } {
  const safeRecipient = escapeHtml(opts.recipientName.split(" ")[0] || "there");
  const safeInviter = escapeHtml(opts.inviterName);
  const safeLoginUrl = escapeHtml(opts.loginUrl);
  const safeEmail = escapeHtml(opts.email);
  const safePass = escapeHtml(opts.tempPassword);

  const noteBlock = opts.personalNote && opts.personalNote.trim()
    ? `<tr><td style="padding:0 0 24px 0;">
        <div style="background:#fafafa;border-left:3px solid #D7A542;padding:14px 18px;border-radius:4px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:6px;">A note from ${safeInviter}</div>
          <div style="font-size:14px;color:#333;line-height:1.55;white-space:pre-wrap;">${escapeHtml(opts.personalNote)}</div>
        </div>
      </td></tr>`
    : "";

  const subject = `${opts.inviterName} invited you to Dealz Flow — your login is ready`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:32px 40px 20px 40px;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#D7A542;">Dealz Flow</div>
              <div style="font-size:22px;font-weight:700;color:#14181F;margin-top:6px;">Welcome to the team</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 8px 40px;font-size:15px;color:#333;line-height:1.6;">
              Hi ${safeRecipient},
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;font-size:15px;color:#333;line-height:1.6;">
              ${safeInviter} has set up a Dealz Flow account for you. Use the temporary password below to sign in — you'll be asked to choose a new one right away.
            </td>
          </tr>
          ${noteBlock}
          <tr>
            <td style="padding:0 40px 8px 40px;">
              <div style="background:#14181F;border-radius:10px;padding:20px 22px;color:#fff;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#D7A542;margin-bottom:10px;">Your sign-in details</div>
                <div style="font-size:13px;color:#bbb;margin-bottom:4px;">Email</div>
                <div style="font-size:15px;font-weight:600;margin-bottom:14px;">${safeEmail}</div>
                <div style="font-size:13px;color:#bbb;margin-bottom:4px;">Temporary password</div>
                <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:0.04em;color:#D7A542;">${safePass}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 40px 32px 40px;">
              <a href="${safeLoginUrl}"
                 style="display:inline-block;background:#D7A542;color:#14181F;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.01em;">
                Sign in to Dealz Flow →
              </a>
              <div style="font-size:12px;color:#999;margin-top:14px;">
                ${safeLoginUrl}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px 40px;border-top:1px solid #f0f0f0;font-size:12px;color:#999;line-height:1.55;">
              For security, please don't share this email. After your first sign-in, you'll be required to set a personal password.
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#bbb;margin-top:18px;">Dealz Flow · Powered by Presale Properties</div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Verify caller
    const userToken = authHeader.replace("Bearer ", "");
    const { data: userResp, error: authErr } = await supabase.auth.getUser(userToken);
    if (authErr || !userResp?.user) return json({ error: "Unauthorized" }, 401);
    const inviterId = userResp.user.id;

    const body = (await req.json()) as InviteBody;
    if (!body.email || !body.display_name) {
      return json({ error: "email and display_name are required" }, 400);
    }

    // Caller-scoped client (uses caller's JWT so admin RLS check passes)
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: inviteResult, error: rpcErr } = await userClient.rpc("crm_team_create_invite", {
      _email: body.email,
      _display_name: body.display_name,
      _role: body.role ?? "agent",
    });

    if (rpcErr) {
      console.error("create_invite rpc failed", rpcErr);
      return json({ error: rpcErr.message }, 400);
    }

    const result = inviteResult as {
      invite_id: string;
      token: string;
      expires_at: string;
      accept_path: string;
      email: string;
      display_name: string;
    };

    const origin = (body.app_origin ?? DEFAULT_APP_ORIGIN).replace(/\/$/, "");
    const acceptUrl = `${origin}${result.accept_path}`;

    // Inviter display name (for the email body)
    const { data: inviterTeam } = await supabase
      .from("crm_team")
      .select("display_name")
      .eq("user_id", inviterId)
      .maybeSingle();
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", inviterId)
      .maybeSingle();
    const inviterName =
      inviterTeam?.display_name ||
      inviterProfile?.full_name ||
      userResp.user.email ||
      "Your teammate";

    const mode = body.mode ?? "temp_password";

    // ============================================================
    // TEMP PASSWORD MODE — create the auth user immediately,
    // redeem the invite as them, and email the credentials.
    // ============================================================
    if (mode === "temp_password") {
      const tempPassword = generateTempPassword();
      const loginUrl = `${origin}/auth?invited=1`;

      // 1. Create or update the auth user (email pre-confirmed)
      // Resolve existing user reliably via profiles table (paginated listUsers
      // can miss users beyond the first page).
      let userId: string | null = null;
      const emailLc = result.email.toLowerCase();

      const { data: profileMatch } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("email", emailLc)
        .maybeSingle();
      if (profileMatch?.user_id) userId = profileMatch.user_id as string;

      // Fallback: scan a couple of pages of auth users
      if (!userId) {
        for (let page = 1; page <= 5 && !userId; page++) {
          const { data: existing } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
          const match = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === emailLc);
          if (match) userId = match.id;
          if (!existing?.users || existing.users.length < 200) break;
        }
      }

      if (userId) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: result.display_name },
        });
        if (updErr) {
          console.error("updateUserById failed", updErr);
          return json({ error: updErr.message }, 500);
        }
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: result.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: result.display_name },
        });
        if (createErr || !created?.user) {
          // Most common cause: user already exists but slipped past our lookups.
          // Try one more lookup and update instead of failing.
          console.error("createUser failed, attempting fallback lookup", createErr);
          let fallbackId: string | null = null;
          for (let page = 1; page <= 10 && !fallbackId; page++) {
            const { data: existing } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
            const match = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === emailLc);
            if (match) fallbackId = match.id;
            if (!existing?.users || existing.users.length < 200) break;
          }
          if (!fallbackId) {
            return json({
              error: createErr?.message ?? "Could not create user",
              hint: "If this user already exists in Auth, the lookup did not find them. Try again or contact support.",
            }, 500);
          }
          const { error: updErr2 } = await supabase.auth.admin.updateUserById(fallbackId, {
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: result.display_name },
          });
          if (updErr2) {
            console.error("fallback updateUserById failed", updErr2);
            return json({ error: updErr2.message }, 500);
          }
          userId = fallbackId;
        } else {
          userId = created.user.id;
        }
      }

      // 2. Sign in as them server-side so we can redeem the invite with their JWT
      const anon2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false },
      });
      const { data: signInData, error: signInErr } = await anon2.auth.signInWithPassword({
        email: result.email,
        password: tempPassword,
      });
      if (signInErr || !signInData?.session) {
        console.error("signInWithPassword failed", signInErr);
        return json({ error: signInErr?.message ?? "Could not start session" }, 500);
      }
      const newUserClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
        auth: { persistSession: false },
      });
      const { error: redeemErr } = await newUserClient.rpc("crm_team_redeem_invite", {
        _token: result.token,
      });
      if (redeemErr) {
        console.error("redeem_invite failed", redeemErr);
        return json({ error: redeemErr.message }, 500);
      }

      // 3. Mark profile as must-change-password
      await supabase
        .from("profiles")
        .update({ must_change_password: true })
        .eq("user_id", userId);

      // 4. Email the credentials via bridge (Presale Gmail SMTP)
      const { subject, html } = buildTempPasswordEmail({
        inviterName,
        recipientName: result.display_name,
        loginUrl,
        email: result.email,
        tempPassword,
        personalNote: body.personal_note ?? null,
      });

      const sendResp = await fetch(`${supabaseUrl}/functions/v1/bridge-send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ to: result.email, subject, html }),
      });

      const emailOk = sendResp.ok;
      if (!emailOk) {
        const errText = await sendResp.text();
        console.error("bridge-send-email failed", sendResp.status, errText);
      }

      return json({
        success: true,
        mode: "temp_password",
        email_sent: emailOk,
        invite_id: result.invite_id,
        login_url: loginUrl,
        email: result.email,
        // Returned ONCE so the admin UI can show / copy it as a fallback.
        // Never logged or stored anywhere else.
        temp_password: tempPassword,
        warning: emailOk ? undefined : "Account created but the email failed to send. Share the temporary password manually.",
      });
    }

    // ============================================================
    // SET-PASSWORD MODE (legacy) — user picks their own password via link.
    // ============================================================
    const { subject, html } = buildInviteEmail({
      inviterName,
      recipientName: result.display_name,
      acceptUrl,
      expiresAt: result.expires_at,
      personalNote: body.personal_note ?? null,
    });

    const sendResp = await fetch(`${supabaseUrl}/functions/v1/bridge-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        to: result.email,
        subject,
        html,
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      console.error("bridge-send-email failed", sendResp.status, errText);
      return json({
        success: true,
        email_sent: false,
        accept_url: acceptUrl,
        invite_id: result.invite_id,
        expires_at: result.expires_at,
        warning: "Invite created but the email failed to send. Copy the link to share manually.",
      });
    }

    return json({
      success: true,
      email_sent: true,
      accept_url: acceptUrl,
      invite_id: result.invite_id,
      expires_at: result.expires_at,
    });
  } catch (e) {
    console.error("crm-invite-agent error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
