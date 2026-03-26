import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Refresh access token if expired
async function getValidAccessToken(supabase: any, userId: string): Promise<{ accessToken: string; error?: string } | null> {
  const { data: tokenRow } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!tokenRow) return null;

  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  const now = Date.now();

  // If token still valid (with 60s buffer), return it
  if (expiresAt - now > 60_000) {
    return { accessToken: tokenRow.access_token };
  }

  // Refresh the token
  const CLIENT_ID = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID');
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { accessToken: '', error: 'OAuth credentials not configured' };
  }

  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const refreshData = await refreshRes.json();
  if (!refreshRes.ok || !refreshData.access_token) {
    console.error('Token refresh failed:', JSON.stringify(refreshData));
    return { accessToken: '', error: 'Token refresh failed. Please reconnect Google Calendar.' };
  }

  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from('google_calendar_tokens')
    .update({
      access_token: refreshData.access_token,
      token_expires_at: newExpiresAt,
    })
    .eq('user_id', userId);

  return { accessToken: refreshData.access_token };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if user is authenticated
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      userId = user?.id || null;
    }

    // ── POST: create or update an event ──────────────────────────────
    if (req.method === 'POST') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenResult = await getValidAccessToken(supabase, userId);
      if (!tokenResult || tokenResult.error) {
        return new Response(JSON.stringify({ error: tokenResult?.error || 'Google Calendar not connected' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const { action, eventId, event, calendarId = 'primary' } = body;

      if (action === 'create') {
        const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to create event');
        return new Response(JSON.stringify({ event: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update' && eventId) {
        const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tokenResult.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to update event');
        return new Response(JSON.stringify({ event: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete' && eventId) {
        const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        });
        if (!res.ok && res.status !== 204) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.message || 'Failed to delete event');
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GET: fetch events ────────────────────────────────────────────
    const url = new URL(req.url);
    const timeMin = url.searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = url.searchParams.get('timeMax');
    const maxResults = url.searchParams.get('maxResults') || '100';

    // Try OAuth token first (full details) — fetch from ALL subscribed calendars
    if (userId) {
      const tokenResult = await getValidAccessToken(supabase, userId);
      if (tokenResult && !tokenResult.error) {
        const authHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };

        // 1. Get the user's calendar list (only selected/visible calendars)
        const calListRes = await fetch(`${CALENDAR_API}/users/me/calendarList?minAccessRole=reader`, {
          headers: authHeaders,
        });
        const calListData = await calListRes.json();

        if (calListRes.ok && calListData.items?.length) {
          // Filter to only calendars the user has marked as "selected" (visible)
          const selectedCalendars = (calListData.items as any[]).filter(
            (cal: any) => cal.selected !== false
          );

          // 2. Fetch events from each selected calendar in parallel
          const allEvents: any[] = [];
          const fetchPromises = selectedCalendars.map(async (cal: any) => {
            const params = new URLSearchParams({
              timeMin,
              maxResults,
              singleEvents: 'true',
              orderBy: 'startTime',
            });
            if (timeMax) params.set('timeMax', timeMax);

            const apiUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`;
            try {
              const response = await fetch(apiUrl, { headers: authHeaders });
              const data = await response.json();
              if (response.ok && data.items) {
                for (const item of data.items) {
                  allEvents.push({
                    id: item.id,
                    title: item.summary?.trim() || 'Untitled event',
                    description: item.description || null,
                    location: item.location || null,
                    start: item.start?.dateTime || item.start?.date || null,
                    end: item.end?.dateTime || item.end?.date || null,
                    allDay: !item.start?.dateTime,
                    color: item.colorId || null,
                    calendarColor: cal.backgroundColor || null,
                    calendarName: cal.summary || null,
                    calendarId: cal.id,
                    htmlLink: item.htmlLink || null,
                  });
                }
              }
            } catch (e) {
              console.error(`Failed to fetch events from calendar ${cal.id}:`, e);
            }
          });

          await Promise.all(fetchPromises);

          // Sort all events by start time
          allEvents.sort((a, b) => {
            const aTime = new Date(a.start || 0).getTime();
            const bTime = new Date(b.start || 0).getTime();
            return aTime - bTime;
          });

          return new Response(JSON.stringify({ events: allEvents, authenticated: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // If calendar list fetch fails, fall through to API key
        console.error('Calendar list fetch failed, falling back to API key:', calListData.error?.message);
      }
    }

    // Fallback: API key (public read-only)
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    if (!GOOGLE_CALENDAR_API_KEY) {
      return new Response(JSON.stringify({ error: 'No calendar access configured', events: [], authenticated: false }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const calendarId = url.searchParams.get('calendarId') || 'info@meetuzair.com';
    const params = new URLSearchParams({
      key: GOOGLE_CALENDAR_API_KEY,
      timeMin,
      maxResults,
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    if (timeMax) params.set('timeMax', timeMax);

    const apiUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error('Google Calendar API error:', JSON.stringify(data));
      throw new Error(`Google Calendar API error [${response.status}]: ${data.error?.message || 'Unknown'}`);
    }

    const events = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary?.trim() || 'Busy',
      description: item.description || null,
      location: item.location || null,
      start: item.start?.dateTime || item.start?.date || null,
      end: item.end?.dateTime || item.end?.date || null,
      allDay: !item.start?.dateTime,
      color: item.colorId || null,
      htmlLink: item.htmlLink || null,
    }));

    return new Response(JSON.stringify({ events, authenticated: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
