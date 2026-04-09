import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CLIENT_ID = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID');
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET');

  try {
    // Authenticate user
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
    const { to, cc, bcc, subject, bodyHtml, bodyText, contactId, includeSignature = true } = body;

    if (!to || !subject || (!bodyHtml && !bodyText)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch email settings (sender name, reply-to, signature)
    const { data: emailSettings } = await supabase
      .from('crm_email_settings')
      .select('sender_name, reply_to, signature_html')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get Gmail tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: 'Gmail not connected. Please connect Gmail in CRM Settings.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if expired
    let accessToken = tokenData.access_token;
    const expiresAt = new Date(tokenData.token_expires_at);
    if (expiresAt <= new Date(Date.now() + 60000)) {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'OAuth credentials not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok || !refreshData.access_token) {
        console.error('Gmail token refresh failed:', JSON.stringify(refreshData));
        return new Response(JSON.stringify({ error: 'Gmail token expired. Please reconnect Gmail.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      accessToken = refreshData.access_token;
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
      await supabase
        .from('gmail_tokens')
        .update({ access_token: accessToken, token_expires_at: newExpiresAt })
        .eq('user_id', user.id);
    }

    // Build From header with display name
    const rawEmail = tokenData.gmail_email || user.email || '';
    const senderName = emailSettings?.sender_name;
    const fromEmail = senderName ? `"${senderName}" <${rawEmail}>` : rawEmail;
    const replyTo = emailSettings?.reply_to;

    // Append signature to body
    const signature = emailSettings?.signature_html || '';
    const fullBodyHtml = bodyHtml
      ? (signature ? `${bodyHtml}<br><br>--<br>${signature}` : bodyHtml)
      : null;
    const fullBodyText = bodyText
      ? (signature ? `${bodyText}\n\n--\n${signature.replace(/<[^>]*>/g, '')}` : bodyText)
      : null;

    // Build RFC 2822 message
    const emailContent = fullBodyHtml
      ? [
          `From: ${fromEmail}`,
          `To: ${to}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          ...(bcc ? [`Bcc: ${bcc}`] : []),
          ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
          `Subject: ${subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          fullBodyHtml,
        ].join('\r\n')
      : [
          `From: ${fromEmail}`,
          `To: ${to}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          ...(bcc ? [`Bcc: ${bcc}`] : []),
          ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
          `Subject: ${subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=UTF-8`,
          ``,
          fullBodyText,
        ].join('\r\n');

    // Base64url encode
    const encoder = new TextEncoder();
    const bytes = encoder.encode(emailContent);
    const base64 = btoa(String.fromCharCode(...bytes));
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Send via Gmail API
    const sendRes = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64url }),
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      console.error('Gmail send failed:', JSON.stringify(sendData));
      return new Response(JSON.stringify({ error: sendData.error?.message || 'Failed to send email' }), {
        status: sendRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log email in crm_email_log
    if (contactId) {
      await supabase.from('crm_email_log').insert({
        contact_id: contactId,
        user_id: user.id,
        subject,
        body: bodyText || bodyHtml || '',
        direction: 'outbound',
        gmail_message_id: sendData.id || null,
        cc: cc || null,
        bcc: bcc || null,
      });

      // Also log as activity in crm_messages
      let convId: string | null = null;
      const { data: existingConv } = await supabase
        .from('crm_conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('channel', 'email')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConv) {
        convId = existingConv.id;
      } else {
        const { data: newConv } = await supabase
          .from('crm_conversations')
          .insert({ contact_id: contactId, channel: 'email', status: 'open' })
          .select('id')
          .single();
        convId = newConv?.id || null;
      }

      if (convId) {
        await supabase.from('crm_messages').insert({
          conversation_id: convId,
          contact_id: contactId,
          direction: 'outbound',
          content: `Subject: ${subject}\n\n${bodyText || bodyHtml || ''}`,
          channel: 'email',
          sent_by: rawEmail,
          message_type: 'text',
        });
      }
    }

    return new Response(JSON.stringify({ success: true, messageId: sendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('gmail-send error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
