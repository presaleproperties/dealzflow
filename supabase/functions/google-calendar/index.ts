import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    if (!GOOGLE_CALENDAR_API_KEY) {
      throw new Error('GOOGLE_CALENDAR_API_KEY is not configured');
    }

    const url = new URL(req.url);
    const calendarId = url.searchParams.get('calendarId') || 'info@meetuzair.com';
    const timeMin = url.searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = url.searchParams.get('timeMax');
    const maxResults = url.searchParams.get('maxResults') || '50';

    const params = new URLSearchParams({
      key: GOOGLE_CALENDAR_API_KEY,
      timeMin,
      maxResults,
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    if (timeMax) params.set('timeMax', timeMax);

    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error('Google Calendar API error:', JSON.stringify(data));
      throw new Error(`Google Calendar API error [${response.status}]: ${data.error?.message || 'Unknown'}`);
    }

    // Map to lean event objects
    const events = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || '(No title)',
      description: item.description || null,
      location: item.location || null,
      start: item.start?.dateTime || item.start?.date || null,
      end: item.end?.dateTime || item.end?.date || null,
      allDay: !item.start?.dateTime,
      color: item.colorId || null,
      htmlLink: item.htmlLink || null,
    }));

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching calendar events:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
