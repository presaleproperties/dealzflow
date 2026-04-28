// Generate an Open Graph image (1200x630 SVG) for an agent's booking page.
// Renders: agent headshot (or initials), name, brokerage, accent gold bar.
// Usage: GET /functions/v1/scheduler-og-image?team=<slug>[&event=<slug>]
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct};base64,${btoa(bin)}`;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const teamSlug = (url.searchParams.get('team') || '').trim().toLowerCase();
    const eventSlug = (url.searchParams.get('event') || '').trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let displayName = 'Book a meeting';
    let brokerage = '';
    let headshot: string | null = null;
    let eventTitle = '';

    if (teamSlug) {
      const { data: prof } = await supabase
        .from('crm_scheduler_agent_profiles')
        .select('display_name, brokerage, headshot_url')
        .eq('team_slug', teamSlug)
        .maybeSingle();
      if (prof) {
        displayName = prof.display_name || displayName;
        brokerage = prof.brokerage || '';
        if (prof.headshot_url) headshot = await fetchAsDataUri(prof.headshot_url);
      }
      if (eventSlug) {
        const { data: et } = await supabase
          .from('crm_scheduler_event_types')
          .select('title')
          .eq('team_slug', teamSlug)
          .eq('slug', eventSlug)
          .maybeSingle();
        if (et) eventTitle = et.title || '';
      }
    }

    const initials = displayName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
    const W = 1200, H = 630;

    const headshotEl = headshot
      ? `<defs><clipPath id="c"><circle cx="240" cy="315" r="170"/></clipPath></defs>
         <circle cx="240" cy="315" r="174" fill="#e7e2d6"/>
         <image href="${headshot}" x="70" y="145" width="340" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#c)"/>`
      : `<circle cx="240" cy="315" r="170" fill="#D7A542"/>
         <text x="240" y="315" text-anchor="middle" dominant-baseline="central"
               font-family="Georgia, serif" font-size="130" fill="white" font-weight="500">${escapeXml(initials)}</text>`;

    const subtitle = eventTitle ? `${eventTitle}${brokerage ? ' · ' + brokerage : ''}` : brokerage;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#faf8f3"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#D7A542"/>
  ${headshotEl}
  <text x="460" y="270" font-family="Georgia, 'Playfair Display', serif" font-size="64" fill="#1a1a1a" font-weight="500">
    ${escapeXml(displayName)}
  </text>
  <text x="460" y="330" font-family="-apple-system, 'Public Sans', sans-serif" font-size="28" fill="#7a7468">
    ${escapeXml(subtitle)}
  </text>
  <line x1="460" y1="370" x2="540" y2="370" stroke="#D7A542" stroke-width="3"/>
  <text x="460" y="430" font-family="Georgia, serif" font-size="32" fill="#1a1a1a" font-style="italic">
    ${eventTitle ? 'Pick a time that works for you' : 'Schedule a conversation'}
  </text>
</svg>`;

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    });
  } catch (e) {
    return new Response(`<!-- error: ${(e as Error).message} -->`, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'image/svg+xml' },
    });
  }
});
