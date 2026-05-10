// Shared helpers to require auth in edge functions deployed with verify_jwt = false.
// Validates the caller's JWT against Supabase Auth and (optionally) checks an admin role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface AuthResult {
  ok: boolean;
  userId?: string;
  error?: string;
  status?: number;
}

export async function requireUser(req: Request): Promise<AuthResult> {
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return { ok: false, error: 'missing_authorization', status: 401 };
  }
  const token = auth.slice(7).trim();
  if (!token) return { ok: false, error: 'missing_token', status: 401 };

  if (!SUPABASE_URL || !ANON_KEY) {
    return { ok: false, error: 'auth_not_configured', status: 500 };
  }

  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, error: 'invalid_token', status: 401 };
  }
  return { ok: true, userId: data.user.id };
}

export async function requireAdmin(req: Request): Promise<AuthResult> {
  const userRes = await requireUser(req);
  if (!userRes.ok) return userRes;
  if (!SERVICE_ROLE) return { ok: false, error: 'admin_not_configured', status: 500 };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userRes.userId!)
    .eq('role', 'admin')
    .maybeSingle();

  if (error) return { ok: false, error: 'role_check_failed', status: 500 };
  if (!data) return { ok: false, error: 'forbidden', status: 403 };
  return { ok: true, userId: userRes.userId };
}
