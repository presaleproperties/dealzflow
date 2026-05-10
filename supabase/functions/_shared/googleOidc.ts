// Verify Google-signed OIDC JWTs from Pub/Sub push subscriptions.
// Pub/Sub adds: Authorization: Bearer <jwt>
// JWT issuer: https://accounts.google.com
// We verify signature against Google JWKS, check exp, iss, aud, and
// (optionally) email matches the expected service account.

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

type Jwk = {
  kid: string; kty: string; n: string; e: string; alg: string; use: string;
};

let cached: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(): Promise<Jwk[]> {
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`JWKS fetch ${r.status}`);
  const j = await r.json();
  cached = { keys: j.keys, fetchedAt: Date.now() };
  return cached.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToStr(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export type GoogleOidcClaims = {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean;
  sub?: string;
};

export type VerifyOpts = {
  /** Expected `aud` claim. Set to your function URL when configuring the Pub/Sub subscription. */
  audience?: string;
  /** Expected `email` claim (service account email Pub/Sub uses to sign). */
  expectedEmail?: string;
};

/**
 * Verify a Google-signed JWT from an Authorization header.
 * Returns claims on success, throws on any failure.
 */
export async function verifyGoogleOidcJwt(
  authHeader: string | null,
  opts: VerifyOpts = {},
): Promise<GoogleOidcClaims> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlToStr(headerB64));
  const claims = JSON.parse(b64urlToStr(payloadB64)) as GoogleOidcClaims;

  if (header.alg !== "RS256") throw new Error(`unsupported alg ${header.alg}`);

  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("kid not found in jwks");

  const key = await importRsaKey(jwk);
  const sig = b64urlToBytes(sigB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!ok) throw new Error("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now - 30) throw new Error("token expired");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error(`bad iss ${claims.iss}`);
  }
  if (opts.audience && claims.aud !== opts.audience) {
    throw new Error(`aud mismatch: got ${claims.aud}`);
  }
  if (opts.expectedEmail) {
    if (claims.email?.toLowerCase() !== opts.expectedEmail.toLowerCase()) {
      throw new Error(`email mismatch: got ${claims.email}`);
    }
    if (claims.email_verified === false) throw new Error("email not verified");
  }
  return claims;
}
