// Server-side OG / meta fetcher for the timeline link preview.
// Fetches the target URL with a short timeout, parses <title>, meta description,
// OG tags and favicon, and returns a small JSON payload for the client.
import { requireUser } from '../_shared/requireAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024; // 512KB cap — head of doc is enough for meta tags

interface MetaResult {
  url: string;
  finalUrl?: string;
  status?: number;
  title?: string | null;
  description?: string | null;
  siteName?: string | null;
  image?: string | null;
  favicon?: string | null;
  type?: string | null;
  error?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractMetaTag(html: string, attrs: { name?: string; property?: string }): string | null {
  const key = attrs.property ? 'property' : 'name';
  const val = attrs.property ?? attrs.name ?? '';
  // Tolerant regex — meta tag in any order, single or double quotes.
  const patterns = [
    new RegExp(
      `<meta[^>]+${key}\\s*=\\s*["']${val}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*${key}\\s*=\\s*["']${val}["'][^>]*>`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i);
  const href = m?.[1];
  if (!href) {
    try {
      return new URL('/favicon.ico', baseUrl).toString();
    } catch {
      return null;
    }
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  // Block fetching internal / metadata IPs from the edge function (SSRF guard)
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower.endsWith('.local')) return true;
  // IPv4 private ranges
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  if (/^127\./.test(lower)) return true;
  if (/^169\.254\./.test(lower)) return true; // link-local / cloud metadata
  // IPv6 loopback / link-local / unique-local
  if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return false;
}

async function fetchHtmlHead(url: string): Promise<{ html: string; finalUrl: string; status: number; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Many sites refuse generic / empty UAs; pretend to be a normal browser.
        'User-Agent':
          'Mozilla/5.0 (compatible; LovableLinkPreview/1.0; +https://lovable.dev)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) {
      return { html: '', finalUrl: res.url, status: res.status, contentType };
    }
    // Read at most MAX_BYTES so a huge page can't blow up the function.
    const reader = res.body?.getReader();
    if (!reader) {
      return { html: '', finalUrl: res.url, status: res.status, contentType };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (received >= MAX_BYTES) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }
    }
    const buf = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return { html, finalUrl: res.url, status: res.status, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMetadata(rawUrl: string): Promise<MetaResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: rawUrl, error: 'unsupported_protocol' };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { url: rawUrl, error: 'blocked_host' };
  }

  try {
    const { html, finalUrl, status, contentType } = await fetchHtmlHead(parsed.toString());
    if (!html) {
      return { url: rawUrl, finalUrl, status, error: contentType ? 'not_html' : 'empty_response' };
    }

    const title =
      extractMetaTag(html, { property: 'og:title' }) ||
      extractMetaTag(html, { name: 'twitter:title' }) ||
      extractTitle(html);

    const description =
      extractMetaTag(html, { property: 'og:description' }) ||
      extractMetaTag(html, { name: 'twitter:description' }) ||
      extractMetaTag(html, { name: 'description' });

    const siteName = extractMetaTag(html, { property: 'og:site_name' });
    const ogImage =
      extractMetaTag(html, { property: 'og:image' }) ||
      extractMetaTag(html, { name: 'twitter:image' });
    const type = extractMetaTag(html, { property: 'og:type' });

    const image = ogImage
      ? (() => {
          try { return new URL(ogImage, finalUrl).toString(); } catch { return null; }
        })()
      : null;

    const favicon = extractFavicon(html, finalUrl);

    return {
      url: rawUrl,
      finalUrl,
      status,
      title: title ?? null,
      description: description ?? null,
      siteName: siteName ?? null,
      image,
      favicon,
      type: type ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_failed';
    return { url: rawUrl, error: /abort/i.test(msg) ? 'timeout' : 'fetch_failed' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let url: string | null = null;
  if (req.method === 'GET') {
    url = new URL(req.url).searchParams.get('url');
  } else if (req.method === 'POST') {
    try {
      const body = await req.json();
      url = typeof body?.url === 'string' ? body.url : null;
    } catch {
      // ignore
    }
  } else {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!url || typeof url !== 'string' || url.length > 2048) {
    return new Response(JSON.stringify({ error: 'invalid_url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const result = await fetchMetadata(url);
  // Cache successful results aggressively at the edge — metadata rarely changes.
  const cacheControl = result.error
    ? 'public, max-age=60'
    : 'public, max-age=86400, stale-while-revalidate=604800';

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  });
});
