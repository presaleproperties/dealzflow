// Shared Twilio X-Twilio-Signature validator.
//
// Twilio computes: base64( HMAC-SHA1( authToken, fullUrl + sortedKey1 + value1 + sortedKey2 + value2 + ... ) )
// where the URL is the EXACT URL Twilio POSTed to (including query string).
// For application/x-www-form-urlencoded, the params are the form fields.
//
// Reference: https://www.twilio.com/docs/usage/security#validating-requests
//
// Returns true when valid, false otherwise. If TWILIO_AUTH_TOKEN is not set
// the validator hard-fails (returns false) — never silently accept.

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Reconstruct the URL Twilio originally posted to (Supabase functions sit
 *  behind a proxy, so req.url may have a different host. Prefer x-forwarded
 *  headers when present, then fall back to req.url). */
export function reconstructTwilioUrl(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

export async function isValidTwilioSignature(
  signature: string | null,
  fullUrl: string,
  params: Record<string, string>,
): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken || !signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of sortedKeys) data += k + params[k];

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = base64(sig);
  return timingSafeEq(expected, signature);
}
