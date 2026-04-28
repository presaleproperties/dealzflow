-- Invite status enum
DO $$ BEGIN
  CREATE TYPE public.crm_invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invites table
CREATE TABLE IF NOT EXISTS public.crm_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'admin', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  status public.crm_invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.crm_team(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_team_invites_email ON public.crm_team_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_team_invites_status ON public.crm_team_invites(status);

ALTER TABLE public.crm_team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_invites" ON public.crm_team_invites;
CREATE POLICY "admins_select_invites" ON public.crm_team_invites
  FOR SELECT TO authenticated
  USING (public.is_crm_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_insert_invites" ON public.crm_team_invites;
CREATE POLICY "admins_insert_invites" ON public.crm_team_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_update_invites" ON public.crm_team_invites;
CREATE POLICY "admins_update_invites" ON public.crm_team_invites
  FOR UPDATE TO authenticated
  USING (public.is_crm_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_crm_team_invites_updated ON public.crm_team_invites;
CREATE TRIGGER trg_crm_team_invites_updated
  BEFORE UPDATE ON public.crm_team_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RPC: create invite
-- Returns: { invite_id, token (raw, one-shot), expires_at, accept_url_path }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crm_team_create_invite(
  _email text,
  _display_name text,
  _role text DEFAULT 'agent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_invite_id uuid;
  v_team_id uuid;
  v_expires timestamptz;
  v_email text := lower(btrim(_email));
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can invite agents';
  END IF;
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF _display_name IS NULL OR length(btrim(_display_name)) = 0 THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;
  IF _role NOT IN ('agent','admin','viewer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- Generate URL-safe token (32 bytes -> 64 hex chars)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '7 days';

  -- Find or create the crm_team row for this person
  SELECT id INTO v_team_id
    FROM public.crm_team
   WHERE lower(email) = v_email
   LIMIT 1;

  IF v_team_id IS NULL THEN
    INSERT INTO public.crm_team (display_name, email, role, is_active, invited_by, invited_at)
    VALUES (btrim(_display_name), v_email, _role, true, auth.uid(), now())
    RETURNING id INTO v_team_id;
  ELSE
    -- Refresh display_name/role on the existing row (don't overwrite user_id if linked)
    UPDATE public.crm_team
       SET display_name = btrim(_display_name),
           role = _role,
           is_active = true,
           invited_by = COALESCE(invited_by, auth.uid()),
           invited_at = COALESCE(invited_at, now())
     WHERE id = v_team_id;
  END IF;

  -- Revoke any prior pending invites for this email
  UPDATE public.crm_team_invites
     SET status = 'revoked', updated_at = now()
   WHERE lower(email) = v_email AND status = 'pending';

  INSERT INTO public.crm_team_invites
    (email, display_name, role, token_hash, expires_at, invited_by, team_id)
  VALUES
    (v_email, btrim(_display_name), _role, v_hash, v_expires, auth.uid(), v_team_id)
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'invite_id', v_invite_id,
    'token', v_token,
    'expires_at', v_expires,
    'accept_path', '/accept-invite?token=' || v_token,
    'team_id', v_team_id,
    'email', v_email,
    'display_name', btrim(_display_name)
  );
END;
$$;

-- ============================================================================
-- RPC: revoke invite
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crm_team_revoke_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can revoke invites';
  END IF;
  UPDATE public.crm_team_invites
     SET status = 'revoked', updated_at = now()
   WHERE id = _invite_id AND status = 'pending';
END;
$$;

-- ============================================================================
-- RPC: list invites (admin view)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crm_team_list_invites()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  status public.crm_invite_status,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, email, display_name, role, status, expires_at, accepted_at, created_at
    FROM public.crm_team_invites
   WHERE public.is_crm_admin(auth.uid())
   ORDER BY created_at DESC
   LIMIT 100;
$$;

-- ============================================================================
-- RPC: validate invite token (public; returns invite metadata or error)
-- Used by the /accept-invite page BEFORE the user signs up.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crm_team_validate_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row public.crm_team_invites;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_token');
  END IF;
  v_hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO v_row FROM public.crm_team_invites WHERE token_hash = v_hash LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('valid', false, 'reason', v_row.status::text);
  END IF;
  IF v_row.expires_at < now() THEN
    UPDATE public.crm_team_invites SET status = 'expired', updated_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'invite_id', v_row.id,
    'email', v_row.email,
    'display_name', v_row.display_name,
    'role', v_row.role,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ============================================================================
-- RPC: redeem invite (called AFTER the invited user signs up & is logged in)
-- Links their auth.uid() to the crm_team row + approves workspace.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crm_team_redeem_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_row public.crm_team_invites;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to redeem an invite';
  END IF;
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  v_hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  SELECT * INTO v_row FROM public.crm_team_invites WHERE token_hash = v_hash LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This invite is no longer valid (%)', v_row.status;
  END IF;
  IF v_row.expires_at < now() THEN
    UPDATE public.crm_team_invites SET status = 'expired', updated_at = now() WHERE id = v_row.id;
    RAISE EXCEPTION 'This invite has expired';
  END IF;

  -- Pull the user's email
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF lower(v_email) <> v_row.email THEN
    RAISE EXCEPTION 'You must accept the invite from the same email address it was sent to';
  END IF;

  -- Link the team row
  UPDATE public.crm_team
     SET user_id = v_uid,
         is_active = true,
         display_name = COALESCE(NULLIF(display_name,''), v_row.display_name),
         role = v_row.role
   WHERE id = v_row.team_id;

  -- Approve workspace access (so they can sign in to the app)
  UPDATE public.profiles
     SET workspace_status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         full_name = COALESCE(NULLIF(full_name,''), v_row.display_name),
         updated_at = now()
   WHERE user_id = v_uid;

  -- Mark invite accepted
  UPDATE public.crm_team_invites
     SET status = 'accepted', accepted_at = now(), accepted_user_id = v_uid, updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'team_id', v_row.team_id,
    'role', v_row.role
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.crm_team_create_invite(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_team_revoke_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_team_list_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_team_validate_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_team_redeem_invite(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_team_create_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_team_revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_team_list_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_team_validate_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_team_redeem_invite(text) TO authenticated;