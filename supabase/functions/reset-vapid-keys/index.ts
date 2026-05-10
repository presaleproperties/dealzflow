// Generates a valid VAPID key pair for Web Push
import { requireAdmin } from '../_shared/requireAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Generate ECDH P-256 key pair (required for Web Push / VAPID)
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Public key: raw 65-byte uncompressed point
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKey = toBase64url(publicKeyRaw);

    // Private key: PKCS#8, then extract the raw 32-byte scalar (bytes 36-68)
    const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const pkcs8Bytes = new Uint8Array(privateKeyPkcs8);
    // PKCS#8 for P-256: header is 36 bytes, followed by 32-byte private key scalar
    const rawPrivateKey = pkcs8Bytes.slice(36, 68);
    const privateKey = toBase64url(rawPrivateKey);

    // Verify: re-import the raw private key as PKCS#8 to confirm round-trip
    // Build a proper PKCS#8 DER wrapper for the raw key
    const pkcs8Header = new Uint8Array([
      0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
      0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
      0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
      0x01, 0x04, 0x20
    ]);
    const pkcs8Full = new Uint8Array(pkcs8Header.length + 32);
    pkcs8Full.set(pkcs8Header);
    pkcs8Full.set(rawPrivateKey, pkcs8Header.length);

    // Re-import to verify it works for signing
    await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Full.buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    return new Response(JSON.stringify({
      VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey,
      verified: true,
      note: 'VAPID_PRIVATE_KEY is the raw 32-byte scalar (base64url). Update both secrets.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
