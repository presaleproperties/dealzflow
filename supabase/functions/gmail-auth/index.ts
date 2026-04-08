import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const CLIENT_ID = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID');
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'OAuth credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-auth`;

  try {
    const url = new URL(req.url);

    // GET with ?code= → OAuth callback from Google
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      let redirectUrl = 'https://commissioniq.lovable.app/crm/settings';
      try {
        const parsed = JSON.parse(atob(state || ''));
        if (parsed?.redirectUrl) redirectUrl = parsed.redirectUrl;
      } catch {}
      return Response.redirect(`${redirectUrl}?gmail_auth=error&message=${encodeURIComponent(oauthError)}`, 302);
    }

    if (code && state) {
      let userId: string;
      let redirectUrl: string;
      try {
        const parsed = JSON.parse(atob(state));
        userId = parsed.userId;
        redirectUrl = parsed.redirectUrl;
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid state' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        console.error('Gmail token exchange failed:', JSON.stringify(tokens));
        return Response.redirect(`${redirectUrl}?gmail_auth=error&message=${encodeURIComponent('Failed to get tokens')}`, 302);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Keep existing refresh token if Google doesn't return a new one
      const { data: existing } = await supabase
        .from('gmail_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .maybeSingle();

      const refreshToken = tokens.refresh_token || existing?.refresh_token;
      if (!refreshToken) {
        return Response.redirect(`${redirectUrl}?gmail_auth=error&message=${encodeURIComponent('No refresh token. Revoke app access in Google and reconnect.')}`, 302);
      }

      // Get Gmail email address
      let gmailEmail: string | null = null;
      try {
        const infoRes = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const info = await infoRes.json();
        gmailEmail = info.email || null;
      } catch {}

      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      const { error: dbError } = await supabase
        .from('gmail_tokens')
        .upsert({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: refreshToken,
          token_expires_at: expiresAt,
          gmail_email: gmailEmail,
        }, { onConflict: 'user_id' });

      if (dbError) {
        console.error('Gmail DB upsert error:', dbError);
        return Response.redirect(`${redirectUrl}?gmail_auth=error&message=${encodeURIComponent('Failed to save tokens')}`, 302);
      }

      return Response.redirect(`${redirectUrl}?gmail_auth=success`, 302);
    }

    // POST → actions
    if (req.method === 'POST') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const action = body.action;

      if (action === 'get_auth_url') {
        const redirectUrl = body.redirectUrl || 'https://commissioniq.lovable.app/crm/settings';
        const stateData = btoa(JSON.stringify({ userId: user.id, redirectUrl }));

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(CLIENT_ID)}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(SCOPES)}` +
          `&access_type=offline` +
          `&include_granted_scopes=true` +
          `&prompt=${encodeURIComponent('consent select_account')}` +
          (user.email ? `&login_hint=${encodeURIComponent(user.email)}` : '') +
          `&state=${encodeURIComponent(stateData)}`;

        return new Response(JSON.stringify({ authUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'disconnect') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supabase.from('gmail_tokens').delete().eq('user_id', user.id);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'status') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { data } = await supabase
          .from('gmail_tokens')
          .select('gmail_email, token_expires_at')
          .eq('user_id', user.id)
          .maybeSingle();

        return new Response(JSON.stringify({
          connected: !!data,
          gmailEmail: data?.gmail_email || null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('gmail-auth error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
