-- 1. New columns on crm_team
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS agent_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_address text;

-- 2. Link Sarb's crm_team row to his existing auth user (idempotent)
UPDATE public.crm_team t
   SET user_id = u.id
  FROM auth.users u
 WHERE t.email = 'sarb@presaleproperties.com'
   AND lower(u.email) = 'sarb@presaleproperties.com'
   AND t.user_id IS NULL;

-- 3. Admin RPC: link any crm_team row to an existing auth user by email
CREATE OR REPLACE FUNCTION public.admin_link_crm_team_to_user(_team_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can link team members to auth users';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No auth user found for email %', _email;
  END IF;

  UPDATE public.crm_team SET user_id = v_uid WHERE id = _team_id;

  -- Auto-approve workspace access so the agent can log in
  UPDATE public.profiles
     SET workspace_status = 'approved',
         approved_at = COALESCE(approved_at, now()),
         approved_by = COALESCE(approved_by, auth.uid()),
         updated_at = now()
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('team_id', _team_id, 'user_id', v_uid);
END;
$$;

-- 4. Admin RPC: set/reset password for an auth user (for onboarding agents)
CREATE OR REPLACE FUNCTION public.admin_set_user_password(_target_user_id uuid, _new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can reset passwords';
  END IF;
  IF length(_new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('user_id', _target_user_id, 'updated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_link_crm_team_to_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_link_crm_team_to_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;