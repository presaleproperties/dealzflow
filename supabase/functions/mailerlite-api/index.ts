import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ML_BASE = 'https://connect.mailerlite.com/api';

async function getMailerLiteKey(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const encKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encKey) return null;

  const { data } = await supabaseAdmin.rpc('decrypt_api_credential', {
    ciphertext: '',
    passphrase: encKey,
  });

  // Get the platform_connections row for mailerlite
  const { data: conn } = await supabaseAdmin
    .from('platform_connections')
    .select('api_key')
    .eq('user_id', userId)
    .eq('platform', 'mailerlite')
    .eq('is_active', true)
    .maybeSingle();

  if (!conn?.api_key) return null;

  // Decrypt the API key
  const { data: decrypted } = await supabaseAdmin.rpc('decrypt_api_credential', {
    ciphertext: conn.api_key,
    passphrase: encKey,
  });

  return decrypted || conn.api_key;
}

async function mlFetch(apiKey: string, path: string, options: RequestInit = {}) {
  const url = `${ML_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`MailerLite API error ${res.status}:`, JSON.stringify(data));
    throw new Error(data?.message || `MailerLite API error ${res.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action } = body;

    // ── verify_key: test an API key against MailerLite ──
    if (action === 'verify_key') {
      const { apiKey } = body;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const data = await mlFetch(apiKey, '/subscribers?limit=0');
        return new Response(JSON.stringify({
          valid: true,
          subscriberCount: data?.total || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ valid: false, error: (e as Error).message }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // For all other actions, we need a stored API key
    const apiKey = await getMailerLiteKey(supabaseAdmin, user.id);
    if (!apiKey) {
      // Return 200 with connected: false — this is a normal state, not an error
      return new Response(JSON.stringify({ connected: false, message: 'No API key configured', subscriberCount: 0, groups: [], campaigns: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── status: check connection ──
    if (action === 'status') {
      try {
        const data = await mlFetch(apiKey, '/subscribers?limit=0');
        return new Response(JSON.stringify({
          connected: true,
          subscriberCount: data?.total || 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── groups: list all groups ──
    if (action === 'groups') {
      const data = await mlFetch(apiKey, '/groups?limit=100&sort=name');
      return new Response(JSON.stringify({ groups: data?.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── create_group ──
    if (action === 'create_group') {
      const { name } = body;
      const data = await mlFetch(apiKey, '/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      return new Response(JSON.stringify({ group: data?.data || data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── sync_contacts: sync CRM contacts to MailerLite ──
    if (action === 'sync_contacts') {
      // Get all CRM contacts with emails
      const { data: contacts } = await supabaseAdmin
        .from('crm_contacts')
        .select('id, first_name, last_name, email, contact_type, tags, projects, status')
        .not('email', 'is', null);

      if (!contacts || contacts.length === 0) {
        return new Response(JSON.stringify({ synced: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get existing groups
      const groupsData = await mlFetch(apiKey, '/groups?limit=100');
      const existingGroups: Record<string, string> = {};
      (groupsData?.data || []).forEach((g: { name: string; id: string }) => {
        existingGroups[g.name] = g.id;
      });

      // Ensure standard groups exist
      const standardGroups = ['Leads', 'Realtors', 'Past Clients'];
      for (const gName of standardGroups) {
        if (!existingGroups[gName]) {
          try {
            const created = await mlFetch(apiKey, '/groups', {
              method: 'POST',
              body: JSON.stringify({ name: gName }),
            });
            existingGroups[gName] = created?.data?.id || created?.id;
          } catch { /* group might already exist */ }
        }
      }

      // Sync contacts in batches
      let synced = 0;
      const batchSize = 50;
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);

        for (const c of batch) {
          if (!c.email) continue;

          // Determine groups
          const groups: string[] = [];
          const contactType = c.contact_type || 'lead';
          if (contactType === 'lead') groups.push('Leads');
          else if (contactType === 'realtor') groups.push('Realtors');
          else if (contactType === 'past_client') groups.push('Past Clients');

          // Add project groups
          const projects = c.projects || [];
          for (const proj of projects) {
            if (proj && !existingGroups[proj]) {
              try {
                const created = await mlFetch(apiKey, '/groups', {
                  method: 'POST',
                  body: JSON.stringify({ name: proj }),
                });
                existingGroups[proj] = created?.data?.id || created?.id;
              } catch { /* skip */ }
            }
            if (proj) groups.push(proj);
          }

          const groupIds = groups
            .map(g => existingGroups[g])
            .filter(Boolean);

          try {
            await mlFetch(apiKey, '/subscribers', {
              method: 'POST',
              body: JSON.stringify({
                email: c.email,
                fields: {
                  name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || undefined,
                  last_name: c.last_name || undefined,
                },
                groups: groupIds,
                status: 'active',
              }),
            });
            synced++;
          } catch (e) {
            console.warn(`Failed to sync ${c.email}:`, (e as Error).message);
          }
        }
      }

      // Update sync timestamp
      await supabaseAdmin
        .from('platform_connections')
        .update({ last_synced_at: new Date().toISOString(), sync_status: 'success' })
        .eq('user_id', user.id)
        .eq('platform', 'mailerlite');

      return new Response(JSON.stringify({ synced, total: contacts.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── campaigns: list campaigns ──
    if (action === 'campaigns') {
      const limit = body.limit || 25;
      const data = await mlFetch(apiKey, `/campaigns?filter[status]=sent&limit=${limit}&sort=-finished_at`);
      return new Response(JSON.stringify({ campaigns: data?.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── campaign_detail ──
    if (action === 'campaign_detail') {
      const { campaignId } = body;
      const data = await mlFetch(apiKey, `/campaigns/${campaignId}`);
      return new Response(JSON.stringify({ campaign: data?.data || data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── create_campaign ──
    if (action === 'create_campaign') {
      const { name, subject, content, groupIds, type = 'regular' } = body;

      // 1. Create campaign
      const campaignPayload: Record<string, unknown> = {
        name: name || subject,
        type,
        emails: [{
          subject,
          from_name: body.fromName || 'Zara Team',
          from: body.fromEmail || 'noreply@presaleproperties.com',
          content,
        }],
      };

      if (groupIds && groupIds.length > 0) {
        campaignPayload.groups = groupIds;
      }

      const created = await mlFetch(apiKey, '/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaignPayload),
      });

      const campaignId = created?.data?.id;

      // Also save to local DB for analytics
      await supabaseAdmin.from('crm_email_campaigns').insert({
        subject,
        body_html: content,
        status: 'draft',
        recipients_count: body.recipientCount || 0,
        segment_filter: { type: 'mailerlite', groupIds },
        created_by: user.id,
      });

      return new Response(JSON.stringify({ campaign: created?.data || created, campaignId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── send_campaign ──
    if (action === 'send_campaign') {
      const { campaignId } = body;
      const data = await mlFetch(apiKey, `/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ delivery: 'instant' }),
      });
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── schedule_campaign ──
    if (action === 'schedule_campaign') {
      const { campaignId, date } = body;
      const data = await mlFetch(apiKey, `/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ delivery: 'scheduled', schedule: { date } }),
      });
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('mailerlite-api error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
