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

    const { subject, html } = buildInviteEmail({
      inviterName,
      recipientName: result.display_name,
      acceptUrl,
      expiresAt: result.expires_at,
      personalNote: body.personal_note ?? null,
    });

    // Send via existing bridge-send-email (Presale Gmail SMTP)
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
      // Invite was created; just couldn't send. Return the URL so admin can copy/paste.
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
