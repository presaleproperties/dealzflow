-- List approved workspace profiles + their CRM team status (admin-only)
CREATE OR REPLACE FUNCTION public.crm_team_list_workspace_candidates()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  workspace_status text,
  crm_status text,        -- 'none' | 'active' | 'inactive'
  crm_role text,          -- null when not on team
  crm_team_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can list workspace candidates';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    u.email::text                       AS email,
    p.avatar_url,
    p.workspace_status::text            AS workspace_status,
    CASE
      WHEN t.id IS NULL                 THEN 'none'
      WHEN COALESCE(t.is_active, false) THEN 'active'
      ELSE 'inactive'
    END                                 AS crm_status,
    t.role::text                        AS crm_role,
    t.id                                AS crm_team_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.crm_team t ON t.user_id = p.user_id
  WHERE p.workspace_status = 'approved'
  ORDER BY
    CASE WHEN t.id IS NULL THEN 0 ELSE 1 END,  -- not-on-team first
    p.full_name NULLS LAST,
    u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_team_list_workspace_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_team_list_workspace_candidates() TO authenticated;


-- Update an existing CRM member (role, active flag, display name) by user_id
CREATE OR REPLACE FUNCTION public.crm_team_update_member(
  _user_id uuid,
  _role text DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_owner_count int;
  v_current_role text;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can edit team members';
  END IF;

  IF _role IS NOT NULL AND _role NOT IN ('owner','admin','agent','viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END IF;

  SELECT id, role::text INTO v_team_id, v_current_role
    FROM public.crm_team
   WHERE user_id = _user_id
   LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'That person is not on the CRM team yet';
  END IF;

  -- Safety: never let the last active owner be demoted or deactivated.
  IF v_current_role = 'owner' AND (
       (_role IS NOT NULL AND _role <> 'owner')
       OR _is_active = false
     ) THEN
    SELECT count(*) INTO v_owner_count
      FROM public.crm_team
     WHERE role = 'owner' AND is_active = true;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove or deactivate the last CRM owner';
    END IF;
  END IF;

  UPDATE public.crm_team
     SET role         = COALESCE(_role, role),
         is_active    = COALESCE(_is_active, is_active),
         display_name = COALESCE(NULLIF(btrim(_display_name), ''), display_name),
         updated_at   = now()
   WHERE id = v_team_id;

  RETURN jsonb_build_object(
    'team_id', v_team_id,
    'user_id', _user_id,
    'role', COALESCE(_role, v_current_role),
    'is_active', COALESCE(_is_active, true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_team_update_member(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_team_update_member(uuid, text, boolean, text) TO authenticated;