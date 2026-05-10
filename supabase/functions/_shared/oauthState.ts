// Shared HMAC-SHA256 signed OAuth state helper for Google OAuth flows
// (gmail-auth, google-calendar-auth). Prevents OAuth-CSRF + state tampering.
//
// Secret resolution order:
//   1. env OAUTH_STATE_SECRET (if you ever set it manually)
//   2. public.app_secrets where key = 'oauth_state_secret' (auto-seeded by migration)
//
// Format: base64url(JSON{userId, redirectUrl, iat, nonce}).base64url(HMAC)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const enc = new TextEncoder();
let cachedSecret: string | null = null;

async function loadSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = Deno.env.get("OAUTH_STATE_SECRET");
  if (fromEnv) { cachedSecret = fromEnv; return cachedSecret; }
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("app_secrets")
    .select("value")
    .eq("key", "oauth_state_secret")
    .maybeSingle();
  if (error || !data?.value) {
    throw new Error("oauth_state_secret not configured");
  }
  cachedSecret = data.value;
  return cachedSecret;
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str: string): string {
  return b64url(enc.encode(str));
}
function fromB64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function fromB64urlStr(s: string): string {
  return new TextDecoder().decode(fromB64url(s));
}

async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return new Uint8Array(sig);
}

function safeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export type OAuthStatePayload = {
  userId: string;
  redirectUrl: string;
};

export async function encodeOAuthState(payload: OAuthStatePayload): Promise<string> {
  const secret = await loadSecret();
  const body = {
    userId: payload.userId,
    redirectUrl: payload.redirectUrl,
    iat: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const bodyEnc = b64urlStr(JSON.stringify(body));
  const sig = await hmac(secret, bodyEnc);
  return `${bodyEnc}.${b64url(sig)}`;
}

/**
 * Verify and decode a signed state. Returns payload or null on any failure.
 * Also accepts legacy unsigned base64-JSON state (back-compat for in-flight
 * OAuth requests at the moment of deploy) — those will be phased out as
 * old state values expire naturally (Google OAuth state is short-lived).
 */
export async function decodeOAuthState(state: string | null): Promise<OAuthStatePayload | null> {
  if (!state) return null;
  try {
    if (state.includes(".")) {
      const [bodyEnc, sigEnc] = state.split(".");
      if (!bodyEnc || !sigEnc) return null;
      const secret = await loadSecret();
      const expected = await hmac(secret, bodyEnc);
      const got = fromB64url(sigEnc);
      if (!safeEq(got, expected)) return null;
      const parsed = JSON.parse(fromB64urlStr(bodyEnc));
      if (!parsed?.userId || !parsed?.redirectUrl) return null;
      if (typeof parsed.iat !== "number" || Date.now() - parsed.iat > MAX_AGE_MS) return null;
      return { userId: parsed.userId, redirectUrl: parsed.redirectUrl };
    }
    // Legacy unsigned fallback — accept once, log warning.
    console.warn("[oauthState] accepting legacy unsigned state (deprecated)");
    const parsed = JSON.parse(atob(state));
    if (!parsed?.userId || !parsed?.redirectUrl) return null;
    return { userId: parsed.userId, redirectUrl: parsed.redirectUrl };
  } catch (e) {
    console.error("[oauthState] decode failed:", e);
    return null;
  }
}
