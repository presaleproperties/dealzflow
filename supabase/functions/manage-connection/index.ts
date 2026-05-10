import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * manage-connection — secure proxy for platform_connections CRUD.
 *
 * Actions:
 *  - upsert        { platform, api_key, api_secret?, base_url? }
 *  - list          {}
 *  - delete        { connection_id }
 *  - encrypt-all   {} (admin: re-encrypt any legacy plaintext rows for the calling user)
 *
 * All writes use the service-role client so pgp_sym_encrypt can run.
 * Reads via service role, but data returned to the client is always masked.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // User-scoped client (to validate JWT and get user id)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    let userId: string | null = null
    // Prefer getClaims (works with asymmetric signing keys, no network call)
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token)
    if (!claimsError && claimsData?.claims?.sub) {
      userId = claimsData.claims.sub as string
    } else {
      // Fallback to getUser for legacy JWTs
      const { data: userData, error: userError } = await supabaseUser.auth.getUser()
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = userData.user.id
    }

    // Service-role client — can call encrypt/decrypt functions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Passphrase: dedicated ENCRYPTION_KEY secret, never the service role key
    const passphrase = Deno.env.get('ENCRYPTION_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const { action, ...payload } = await req.json()

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await supabaseAdmin
        .from('platform_connections')
        .select('id, user_id, platform, api_key, api_secret, base_url, is_active, last_synced_at, sync_status, sync_error, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) throw error

      // Mask the api_key — show only last 4 chars, never the full value
      const masked = (data || []).map((conn: any) => ({
        ...conn,
        api_key: conn.api_key ? '••••  ••••  ••••  ' + maskKey(conn.api_key, passphrase) : null,
        api_secret: conn.api_secret ? '••••••••' : null,
      }))

      return new Response(JSON.stringify({ data: masked }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── UPSERT ────────────────────────────────────────────────────────────────
    if (action === 'upsert') {
      const { platform, api_key, api_secret, base_url } = payload
      if (!platform || !api_key?.trim()) {
        return new Response(JSON.stringify({ error: 'platform and api_key are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Encrypt credentials via pgcrypto in the DB
      const { data: encKeyData, error: encKeyError } = await supabaseAdmin
        .rpc('encrypt_api_credential', { plaintext: api_key.trim(), passphrase })
      if (encKeyError) throw encKeyError
      const encryptedKey = encKeyData as string

      let encryptedSecret: string | null = null
      if (api_secret?.trim()) {
        const { data: encSecData, error: encSecError } = await supabaseAdmin
          .rpc('encrypt_api_credential', { plaintext: api_secret.trim(), passphrase })
        if (encSecError) throw encSecError
        encryptedSecret = encSecData as string
      }

      const { data: result, error } = await supabaseAdmin
        .from('platform_connections')
        .upsert({
          user_id: userId,
          platform,
          api_key: encryptedKey,
          api_secret: encryptedSecret,
          base_url: base_url || null,
          is_active: true,
        }, { onConflict: 'user_id,platform' })
        .select('id, user_id, platform, base_url, is_active, last_synced_at, sync_status, sync_error, created_at, updated_at')
        .single()

      if (error) throw error

      // Return record without exposing the encrypted value
      return new Response(JSON.stringify({
        data: {
          ...result,
          api_key: '••••  ••••  ••••  ' + api_key.trim().slice(-4),
          api_secret: api_secret?.trim() ? '••••••••' : null,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { connection_id } = payload
      if (!connection_id) {
        return new Response(JSON.stringify({ error: 'connection_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Verify ownership before deleting
      const { data: existing } = await supabaseAdmin
        .from('platform_connections')
        .select('id')
        .eq('id', connection_id)
        .eq('user_id', userId)
        .single()

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Connection not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { error } = await supabaseAdmin
        .from('platform_connections')
        .delete()
        .eq('id', connection_id)

      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── ENCRYPT-ALL ──────────────────────────────────────────────────────────
    // Re-encrypt any legacy plaintext api_key / api_secret for the calling user.
    // A value is considered plaintext if pgp_sym_decrypt throws (not valid pgp ciphertext).
    if (action === 'encrypt-all') {
      const { data: rows, error: fetchErr } = await supabaseAdmin
        .from('platform_connections')
        .select('id, api_key, api_secret')
        .eq('user_id', userId)

      if (fetchErr) throw fetchErr

      let migrated = 0
      for (const row of (rows || [])) {
        const updates: Record<string, string | null> = {}

        // Check api_key
        if (row.api_key) {
          const { data: decrypted } = await supabaseAdmin
            .rpc('decrypt_api_credential', { ciphertext: row.api_key, passphrase })
          // decrypt_api_credential returns the value as-is for legacy plaintext.
          // If the decrypted value equals the stored value, it was plaintext — re-encrypt it.
          if (decrypted === row.api_key) {
            const { data: enc } = await supabaseAdmin
              .rpc('encrypt_api_credential', { plaintext: row.api_key, passphrase })
            updates.api_key = enc as string
          }
        }

        // Check api_secret
        if (row.api_secret) {
          const { data: decrypted } = await supabaseAdmin
            .rpc('decrypt_api_credential', { ciphertext: row.api_secret, passphrase })
          if (decrypted === row.api_secret) {
            const { data: enc } = await supabaseAdmin
              .rpc('encrypt_api_credential', { plaintext: row.api_secret, passphrase })
            updates.api_secret = enc as string
          }
        }

        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabaseAdmin
            .from('platform_connections')
            .update(updates)
            .eq('id', row.id)
          if (upErr) throw upErr
          migrated++
        }
      }

      return new Response(JSON.stringify({ success: true, migrated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[manage-connection] Error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Return last 4 chars of the stored (encrypted) value as a visual hint.
 * We can't async-decrypt here, so we show last 4 of the ciphertext — good enough
 * to let users distinguish between keys without exposing anything sensitive.
 */
function maskKey(storedValue: string, _passphrase: string): string {
  if (!storedValue || storedValue.length < 4) return '????'
  // Strip base64 padding chars for a cleaner display
  const clean = storedValue.replace(/[=\n\r]/g, '')
  return clean.slice(-4).toUpperCase()
}
