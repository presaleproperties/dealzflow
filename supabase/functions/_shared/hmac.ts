// Shared HMAC-SHA256 helpers for Presale ↔ DealsFlow webhook signing.
// Header format: `x-presale-signature: sha256=<hex>`
// Secret env: PRESALE_WEBHOOK_SECRET

const enc = new TextEncoder();

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function signPresale(body: string): Promise<string> {
  const secret = Deno.env.get("PRESALE_WEBHOOK_SECRET") ?? "";
  if (!secret) throw new Error("PRESALE_WEBHOOK_SECRET not configured");
  return `sha256=${await hmacHex(secret, body)}`;
}

export async function verifyPresaleSignature(
  header: string | null,
  rawBody: string,
): Promise<boolean> {
  const secret = Deno.env.get("PRESALE_WEBHOOK_SECRET") ?? "";
  if (!secret || !header) return false;
  const got = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = await hmacHex(secret, rawBody);
  return safeEq(got, expected);
}
