// Shared helpers for Telnyx edge functions:
//  - CORS headers
//  - Ed25519 webhook signature verification (telnyx-signature-ed25519 / telnyx-timestamp)
//  - Common Telnyx REST helper

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const TELNYX_API = 'https://api.telnyx.com/v2';

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify Telnyx webhook signature.
 * Signed payload format: `${timestamp}|${rawBody}` using Ed25519 with the workspace public key.
 * https://developers.telnyx.com/docs/api/v2/overview#webhook-signing
 */
export async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  publicKeyB64: string | null,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureB64 || !timestamp || !publicKeyB64) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > toleranceSeconds) return false;

  try {
    const keyBytes = b64ToBytes(publicKeyB64);
    const sigBytes = b64ToBytes(signatureB64);
    const msgBytes = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' } as any,
      false,
      ['verify'],
    );
    return await crypto.subtle.verify('Ed25519' as any, key, sigBytes, msgBytes);
  } catch (e) {
    console.error('[telnyx] signature verify error', e);
    return false;
  }
}

export async function telnyxFetch(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<{ ok: boolean; status: number; body: any }> {
  const { apiKey, headers, ...rest } = init;
  const res = await fetch(`${TELNYX_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(headers as Record<string, string> | undefined),
    },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}

export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  if (!t) return null;
  if (t.startsWith('whatsapp:')) return t; // pass-through
  const digits = t.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}
