import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Generate appsecret_proof: HMAC-SHA256 of access_token using app_secret
async function generateAppSecretProof(token: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let META_ACCESS_TOKEN = Deno.env.get('META_ADS_ACCESS_TOKEN');
    const rawAccountId = Deno.env.get('META_AD_ACCOUNT_ID') || '';
    const AD_ACCOUNT_ID = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`;
    const META_APP_ID = Deno.env.get('META_APP_ID');
    const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

    if (!META_ACCESS_TOKEN || !rawAccountId) {
      return new Response(JSON.stringify({
        error: 'not_configured',
        message: 'Meta Ads credentials not configured',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-exchange short-lived token for long-lived token if app credentials are available
    if (META_APP_ID && META_APP_SECRET) {
      try {
        const exchangeUrl = `${GRAPH_API}/oauth/access_token?` + new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          fb_exchange_token: META_ACCESS_TOKEN,
        });
        const exchangeRes = await fetch(exchangeUrl);
        const exchangeData = await exchangeRes.json();
        if (exchangeData.access_token && !exchangeData.error) {
          META_ACCESS_TOKEN = exchangeData.access_token;
          console.log('Successfully exchanged for long-lived token, expires in:', exchangeData.expires_in, 'seconds');
        } else if (exchangeData.error) {
          console.warn('Token exchange failed (using current token):', exchangeData.error.message);
        }
      } catch (e) {
        console.warn('Token exchange error (using current token):', e);
      }
    }

    // Build common params including appsecret_proof when app secret is available
    const baseParams: Record<string, string> = { access_token: META_ACCESS_TOKEN };
    if (META_APP_SECRET) {
      baseParams.appsecret_proof = await generateAppSecretProof(META_ACCESS_TOKEN, META_APP_SECRET);
    }

    const url = new URL(req.url);
    const datePreset = url.searchParams.get('date_preset') || 'last_7d';

    // Fetch account-level insights
    const insightsUrl = `${GRAPH_API}/${AD_ACCOUNT_ID}/insights?` + new URLSearchParams({
      ...baseParams,
      fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,frequency',
      date_preset: datePreset,
      level: 'account',
    });

    const campaignsUrl = `${GRAPH_API}/${AD_ACCOUNT_ID}/campaigns?` + new URLSearchParams({
      ...baseParams,
      fields: 'name,status,objective',
      limit: '20',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
    });

    // Fetch budget info
    const accountUrl = `${GRAPH_API}/${AD_ACCOUNT_ID}?` + new URLSearchParams({
      ...baseParams,
      fields: 'name,currency,amount_spent,balance,spend_cap',
    });

    const [insightsRes, campaignsRes, accountRes] = await Promise.all([
      fetch(insightsUrl),
      fetch(campaignsUrl),
      fetch(accountUrl),
    ]);

    const insightsData = await insightsRes.json();
    const campaignsData = await campaignsRes.json();
    const accountData = await accountRes.json();

    if (insightsData.error) {
      console.error('Meta Ads insights error:', JSON.stringify(insightsData.error));
    }
    if (accountData.error) {
      console.error('Meta Ads account error:', JSON.stringify(accountData.error));
    }
    if (campaignsData.error) {
      console.error('Meta Ads campaigns error:', JSON.stringify(campaignsData.error));
    }

    // If all three fail, return error
    if (insightsData.error && accountData.error) {
      return new Response(JSON.stringify({
        error: 'api_error',
        message: insightsData.error.message || accountData.error.message || 'Meta API error',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse account insights
    const insights = insightsData.data?.[0] || {};
    const actions = (insights.actions || []) as Array<{ action_type: string; value: string }>;
    const costPerAction = (insights.cost_per_action_type || []) as Array<{ action_type: string; value: string }>;

    const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value || '0';
    const cpl = costPerAction.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value || '0';
    const linkClicks = actions.find(a => a.action_type === 'link_click')?.value || '0';
    const messaging = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || '0';

    // Fetch per-campaign insights separately
    const campaignList = campaignsData.data || [];
    const campaignInsightsResults = await Promise.all(
      campaignList.map((c: any) =>
        fetch(`${GRAPH_API}/${c.id}/insights?` + new URLSearchParams({
          ...baseParams,
          fields: 'spend,impressions,clicks,actions,cost_per_action_type',
          date_preset: datePreset,
        })).then(r => r.json()).catch(() => ({ data: [] }))
      )
    );

    const campaigns = campaignList.map((c: any, i: number) => {
      const ci = campaignInsightsResults[i]?.data?.[0] || {};
      const cActions = (ci.actions || []) as Array<{ action_type: string; value: string }>;
      const cCostPerAction = (ci.cost_per_action_type || []) as Array<{ action_type: string; value: string }>;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        spend: parseFloat(ci.spend || '0'),
        impressions: parseInt(ci.impressions || '0'),
        clicks: parseInt(ci.clicks || '0'),
        leads: parseInt(cActions.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value || '0'),
        cpl: parseFloat(cCostPerAction.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')?.value || '0'),
      };
    });

    const result = {
      configured: true,
      datePreset,
      account: {
        name: accountData.name || 'Ad Account',
        currency: accountData.currency || 'USD',
        spendCap: accountData.spend_cap ? parseFloat(accountData.spend_cap) / 100 : null,
      },
      summary: {
        spend: parseFloat(insights.spend || '0'),
        impressions: parseInt(insights.impressions || '0'),
        reach: parseInt(insights.reach || '0'),
        clicks: parseInt(insights.clicks || '0'),
        ctr: parseFloat(insights.ctr || '0'),
        cpc: parseFloat(insights.cpc || '0'),
        cpm: parseFloat(insights.cpm || '0'),
        frequency: parseFloat(insights.frequency || '0'),
        leads: parseInt(leads),
        cpl: parseFloat(cpl),
        linkClicks: parseInt(linkClicks),
        messaging: parseInt(messaging),
      },
      campaigns,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Meta Ads error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'server_error', message: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
