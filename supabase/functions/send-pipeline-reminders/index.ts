// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── VAPID helpers (same implementation as send-push-notification) ──────────

function toBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function makeVapidJwt(vapidPrivateKeyB64: string, audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: 'mailto:notifications@dealzflow.app',
  };
  const encoder = new TextEncoder();
  const encHeader = toBase64url(encoder.encode(JSON.stringify(header)));
  const encPayload = toBase64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', fromBase64url(vapidPrivateKeyB64),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(signingInput)
  );
  return `${signingInput}.${toBase64url(sig)}`;
}

async function encryptPayload(
  payload: string, p256dh: string, auth: string
): Promise<{ ciphertext: ArrayBuffer; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const encoder = new TextEncoder();
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clientPublicKey = await crypto.subtle.importKey('raw', fromBase64url(p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);
  const serverPublicKey = new Uint8Array(serverPublicKeyRaw);
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, serverKeys.privateKey, 256);
  const authBytes = new Uint8Array(fromBase64url(auth));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const clientPublicKeyBytes = new Uint8Array(fromBase64url(p256dh));
  const authInfo = new Uint8Array([...encoder.encode('Content-Encoding: auth\0')]);
  const authKeyMaterial = await crypto.subtle.importKey('raw', authBytes, { name: 'HKDF' }, false, ['deriveBits']);
  const prkBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(sharedBits), info: authInfo }, authKeyMaterial, 256);
  const prkKey = await crypto.subtle.importKey('raw', prkBits, { name: 'HKDF' }, false, ['deriveBits']);
  const context = new Uint8Array([...encoder.encode('P-256\0'), 0, clientPublicKeyBytes.length, ...clientPublicKeyBytes, 0, serverPublicKey.length, ...serverPublicKey]);
  const cekInfo = new Uint8Array([...encoder.encode('Content-Encoding: aesgcm\0'), ...context]);
  const cekBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, prkKey, 128);
  const nonceInfo = new Uint8Array([...encoder.encode('Content-Encoding: nonce\0'), ...context]);
  const nonceBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, prkKey, 96);
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBits }, cek, new Uint8Array([0, 0, ...encoder.encode(payload)]));
  return { ciphertext, salt, serverPublicKey };
}

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<number> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(vapidPrivateKey, audience);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(payload, sub.p256dh, sub.auth);
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = new Uint8Array([...salt, ...rs, serverPublicKey.length, ...serverPublicKey, ...new Uint8Array(ciphertext)]);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${toBase64url(salt.buffer)}`,
      'Crypto-Key': `dh=${toBase64url(serverPublicKey.buffer)};p256ecdsa=${vapidPublicKey}`,
      'TTL': '86400',
    },
    body,
  });
  return res.status;
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const forceMode = body?.mode;

    const dayOfWeek = new Date().getDay();
    const isMonday = dayOfWeek === 1;

    const temperaturesToProcess: string[] = [];
    if (forceMode === 'hot') {
      temperaturesToProcess.push('hot');
    } else if (forceMode === 'warm') {
      temperaturesToProcess.push('warm');
    } else if (forceMode === 'both') {
      temperaturesToProcess.push('hot', 'warm');
    } else {
      temperaturesToProcess.push('hot');
      if (isMonday) temperaturesToProcess.push('warm');
    }

    // Fetch all users who have either a Zapier webhook OR push subscriptions
    const [settingsRes, pushSubsRes] = await Promise.all([
      supabase.from('settings').select('user_id, zapier_webhook_url, notification_phone'),
      supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth, id'),
    ]);

    if (settingsRes.error) throw settingsRes.error;

    // Build a set of user_ids that have push subscriptions
    const pushSubsByUser = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>();
    for (const sub of (pushSubsRes.data || [])) {
      if (!pushSubsByUser.has(sub.user_id)) pushSubsByUser.set(sub.user_id, []);
      pushSubsByUser.get(sub.user_id)!.push(sub);
    }

    // Collect all unique user_ids to process
    const zapierUsers = new Set((settingsRes.data || []).filter((s: any) => s.zapier_webhook_url).map((s: any) => s.user_id));
    const allUserIds = new Set([...zapierUsers, ...pushSubsByUser.keys()]);

    if (allUserIds.size === 0) {
      return new Response(JSON.stringify({ message: 'No users configured for reminders', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settingsByUser = new Map((settingsRes.data || []).map((s: any) => [s.user_id, s]));

    let totalZapierSent = 0;
    let totalPushSent = 0;
    const results: any[] = [];

    for (const user_id of allUserIds) {
      // Fetch prospects for this user
      const { data: prospects, error: prospectsError } = await supabase
        .from('pipeline_prospects')
        .select('*')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .in('temperature', temperaturesToProcess)
        .order('updated_at', { ascending: true });

      if (prospectsError || !prospects || prospects.length === 0) continue;

      const hotProspects = prospects.filter((p: any) => p.temperature === 'hot');
      const warmProspects = prospects.filter((p: any) => p.temperature === 'warm');

      // Build message lines
      const lines: string[] = [];
      if (hotProspects.length > 0) {
        lines.push(`🔥 HOT CLIENTS (${hotProspects.length}) — Follow up today:`);
        hotProspects.forEach((p: any) => {
          lines.push(`  • ${p.client_name} — ${p.home_type}${p.potential_commission > 0 ? ` ($${Number(p.potential_commission).toLocaleString()})` : ''}`);
        });
      }
      if (warmProspects.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push(`☀️ WARM CLIENTS (${warmProspects.length}) — Weekly check-in:`);
        warmProspects.forEach((p: any) => {
          lines.push(`  • ${p.client_name} — ${p.home_type}${p.potential_commission > 0 ? ` ($${Number(p.potential_commission).toLocaleString()})` : ''}`);
        });
      }

      const message = lines.join('\n');
      const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
      const userResult: any = { user_id, prospects: prospects.length };

      // ── 1. Zapier webhook ─────────────────────────────────────────────
      const userSettings = settingsByUser.get(user_id);
      if (userSettings?.zapier_webhook_url) {
        try {
          const webhookPayload = {
            type: 'pipeline_reminder',
            date: today,
            message,
            phone: userSettings.notification_phone || '',
            hot_count: hotProspects.length,
            warm_count: warmProspects.length,
            total_count: prospects.length,
            hot_clients: hotProspects.map((p: any) => ({ name: p.client_name, home_type: p.home_type, deal_type: p.deal_type, potential_commission: p.potential_commission, notes: p.notes })),
            warm_clients: warmProspects.map((p: any) => ({ name: p.client_name, home_type: p.home_type, deal_type: p.deal_type, potential_commission: p.potential_commission, notes: p.notes })),
          };
          const response = await fetch(userSettings.zapier_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
          });
          userResult.zapier = response.status;
          totalZapierSent++;
        } catch (err) {
          console.error(`Zapier failed for ${user_id}:`, err);
          userResult.zapier_error = String(err);
        }
      }

      // ── 2. Push notifications ─────────────────────────────────────────
      const subs = pushSubsByUser.get(user_id);
      if (subs && subs.length > 0 && vapidPublicKey && vapidPrivateKey) {
        // Build a concise push title + body
        const pushTitle = hotProspects.length > 0
          ? `🔥 ${hotProspects.length} hot client${hotProspects.length > 1 ? 's' : ''} need follow-up`
          : `☀️ ${warmProspects.length} warm client${warmProspects.length > 1 ? 's' : ''} — weekly check-in`;

        const firstNames = [...hotProspects, ...warmProspects]
          .slice(0, 3)
          .map((p: any) => p.client_name.split(' ')[0])
          .join(', ');
        const pushBody = firstNames + (prospects.length > 3 ? ` +${prospects.length - 3} more` : '');

        const pushPayload = JSON.stringify({
          title: pushTitle,
          body: pushBody,
          url: '/pipeline',
        });

        let pushSentForUser = 0;
        for (const sub of subs) {
          try {
            const status = await sendWebPush(sub, pushPayload, vapidPublicKey, vapidPrivateKey);
            if (status >= 200 && status < 300) {
              pushSentForUser++;
              totalPushSent++;
            } else if (status === 410 || status === 404) {
              // Subscription expired — clean up
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
          } catch (err) {
            console.error(`Push failed for sub ${sub.id}:`, err);
          }
        }
        userResult.push_sent = pushSentForUser;
      }

      results.push(userResult);
    }

    return new Response(JSON.stringify({
      message: 'Reminders sent',
      zapier_sent: totalZapierSent,
      push_sent: totalPushSent,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Error in send-pipeline-reminders:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
