// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Base64url helpers ──────────────────────────────────────────────────────────
function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── VAPID JWT ─────────────────────────────────────────────────────────────────
async function makeVapidJwt(rawPrivateKeyB64: string, audience: string): Promise<string> {
  const enc = new TextEncoder();

  // Build PKCS#8 wrapper for raw 32-byte P-256 scalar
  const rawKey = fromBase64url(rawPrivateKeyB64);
  if (rawKey.length !== 32) throw new Error(`Bad private key length: ${rawKey.length}`);
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Header.length + 32);
  pkcs8.set(pkcs8Header);
  pkcs8.set(rawKey, pkcs8Header.length);

  const privKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const header  = toBase64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = toBase64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: 'mailto:notifications@dealzflow.app',
  })));
  const input = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(input));
  return `${input}.${toBase64url(sig)}`;
}

// ── aesgcm payload encryption (RFC 8030 / draft-ietf-webpush-encryption-03) ───
async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const enc = new TextEncoder();

  // Ephemeral server ECDH key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const serverPublicRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);
  const serverPublicKey = new Uint8Array(serverPublicRaw); // 65 bytes

  // Client public key
  const clientPublicRaw = fromBase64url(p256dhB64);
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', clientPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // ECDH shared secret (256 bits = 32 bytes)
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeys.privateKey, 256
  );

  const authSecret = fromBase64url(authB64); // 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Helper: uint16 big-endian
  const u16be = (n: number) => new Uint8Array([n >> 8, n & 0xff]);

  // PRK = HKDF-SHA-256(auth_secret, ecdh_secret, "Content-Encoding: auth\0", 32)
  const sharedKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveBits']);
  const prk = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: enc.encode('Content-Encoding: auth\0') },
    sharedKey, 256
  );
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HKDF' }, false, ['deriveBits']);

  // keyinfo = "P-256\0" + u16be(len(clientPub)) + clientPub + u16be(len(serverPub)) + serverPub
  const context = concat([
    enc.encode('P-256\0'),
    u16be(clientPublicRaw.length), clientPublicRaw,
    u16be(serverPublicKey.length), serverPublicKey,
  ]);

  // CEK = HKDF(prk, salt, "Content-Encoding: aesgcm\0" + context, 16)
  const cekInfo  = concat([enc.encode('Content-Encoding: aesgcm\0'), context]);
  const cekBits  = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, prkKey, 128
  );

  // Nonce = HKDF(prk, salt, "Content-Encoding: nonce\0" + context, 12)
  const nonceInfo  = concat([enc.encode('Content-Encoding: nonce\0'), context]);
  const nonceBits  = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, prkKey, 96
  );

  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);

  // Pad: 2 zero bytes + plaintext
  const padded = concat([new Uint8Array(2), enc.encode(plaintext)]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits }, cek, padded
  );

  // Body: salt(16) + rs(4=4096 big-endian) + keyLen(1=65) + serverPublicKey(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = concat([salt, rs, new Uint8Array([65]), serverPublicKey, new Uint8Array(ciphertext)]);

  return { body, salt, serverPublicKey };
}

function concat(arrays: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const parts = arrays.map(a => a instanceof Uint8Array ? a : new Uint8Array(a));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

// ── Send a single Web Push ────────────────────────────────────────────────────
async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<{ status: number; body: string }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(vapidPrivateKey, audience);
  const { body, salt, serverPublicKey } = await encryptPayload(payload, sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${toBase64url(salt)}`,
      'Crypto-Key': `dh=${toBase64url(serverPublicKey)};p256ecdsa=${vapidPublicKey}`,
      'TTL': '86400',
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { user_id, title, message, url: notifUrl, all_users } = await req.json();
    const payload = JSON.stringify({ title: title || '📱 Dealzflow', body: message, url: notifUrl || '/pipeline' });

    let query = supabase.from('push_subscriptions').select('*');
    if (!all_users && user_id) query = query.eq('user_id', user_id);

    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ message: 'No subscriptions found', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    const errors: unknown[] = [];

    for (const sub of subs) {
      try {
        const { status, body: resBody } = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload, vapidPublicKey, vapidPrivateKey,
        );
        if (status >= 200 && status < 300) {
          sent++;
        } else if (status === 410 || status === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          errors.push({ status, body: resBody.substring(0, 200) });
        }
      } catch (err) {
        errors.push({ error: String(err).substring(0, 200) });
      }
    }

    return new Response(JSON.stringify({ sent, total: subs.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-push-notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
