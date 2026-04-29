-- 1. Storage bucket for team headshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-team-headshots', 'crm-team-headshots', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team headshots are publicly viewable" ON storage.objects;
CREATE POLICY "Team headshots are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'crm-team-headshots');

DROP POLICY IF EXISTS "CRM admins can upload team headshots" ON storage.objects;
CREATE POLICY "CRM admins can upload team headshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'crm-team-headshots' AND public.is_crm_admin(auth.uid()));

DROP POLICY IF EXISTS "CRM admins can update team headshots" ON storage.objects;
CREATE POLICY "CRM admins can update team headshots"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'crm-team-headshots' AND public.is_crm_admin(auth.uid()));

DROP POLICY IF EXISTS "CRM admins can delete team headshots" ON storage.objects;
CREATE POLICY "CRM admins can delete team headshots"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'crm-team-headshots' AND public.is_crm_admin(auth.uid()));


-- 2. Admin edit RPC
CREATE OR REPLACE FUNCTION public.crm_team_admin_update_member(
  _team_id uuid,
  _display_name text DEFAULT NULL,
  _title text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _headshot_url text DEFAULT NULL,
  _headshot_focal_y smallint DEFAULT NULL,
  _role text DEFAULT NULL,
  _is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.crm_team%ROWTYPE;
  v_after  public.crm_team%ROWTYPE;
  v_owner_count int;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM owners/admins can edit team members';
  END IF;

  IF _role IS NOT NULL AND _role NOT IN ('owner','admin','agent','viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END IF;

  SELECT * INTO v_before FROM public.crm_team WHERE id = _team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found';
  END IF;

  IF v_before.role::text = 'owner' AND (
       (_role IS NOT NULL AND _role <> 'owner')
       OR _is_active = false
     ) THEN
    SELECT count(*) INTO v_owner_count
      FROM public.crm_team
     WHERE role::text = 'owner' AND is_active = true;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote or deactivate the last CRM owner';
    END IF;
  END IF;

  UPDATE public.crm_team
     SET display_name      = COALESCE(NULLIF(btrim(_display_name), ''), display_name),
         title             = COALESCE(NULLIF(btrim(_title), ''), title),
         phone             = COALESCE(NULLIF(btrim(_phone), ''), phone),
         email             = COALESCE(NULLIF(lower(btrim(_email)), ''), email),
         headshot_url      = COALESCE(NULLIF(btrim(_headshot_url), ''), headshot_url),
         headshot_focal_y  = COALESCE(_headshot_focal_y, headshot_focal_y),
         role              = COALESCE(_role::app_crm_role, role),
         is_active         = COALESCE(_is_active, is_active),
         updated_at        = now()
   WHERE id = _team_id
   RETURNING * INTO v_after;

  IF v_before.display_name IS DISTINCT FROM v_after.display_name THEN
    v_changes := v_changes || jsonb_build_object('display_name', jsonb_build_array(v_before.display_name, v_after.display_name));
  END IF;
  IF v_before.title IS DISTINCT FROM v_after.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(v_before.title, v_after.title));
  END IF;
  IF v_before.phone IS DISTINCT FROM v_after.phone THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_array(v_before.phone, v_after.phone));
  END IF;
  IF v_before.email IS DISTINCT FROM v_after.email THEN
    v_changes := v_changes || jsonb_build_object('email', jsonb_build_array(v_before.email, v_after.email));
  END IF;
  IF v_before.headshot_url IS DISTINCT FROM v_after.headshot_url THEN
    v_changes := v_changes || jsonb_build_object('headshot_url', jsonb_build_array(v_before.headshot_url, v_after.headshot_url));
  END IF;
  IF v_before.headshot_focal_y IS DISTINCT FROM v_after.headshot_focal_y THEN
    v_changes := v_changes || jsonb_build_object('headshot_focal_y', jsonb_build_array(v_before.headshot_focal_y, v_after.headshot_focal_y));
  END IF;
  IF v_before.role IS DISTINCT FROM v_after.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_array(v_before.role::text, v_after.role::text));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_after.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_array(v_before.is_active, v_after.is_active));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, details)
    VALUES (
      auth.uid(),
      v_after.user_id,
      'crm_team.update',
      jsonb_build_object(
        'team_id', v_after.id,
        'display_name', v_after.display_name,
        'changes', v_changes
      )
    );
  END IF;

  RETURN jsonb_build_object('team_id', v_after.id, 'changes', v_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_team_admin_update_member(uuid, text, text, text, text, text, smallint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_team_admin_update_member(uuid, text, text, text, text, text, smallint, text, boolean) TO authenticated;


-- 3. Recent audit feed
CREATE OR REPLACE FUNCTION public.crm_team_recent_audit(_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  admin_user_id uuid,
  admin_name text,
  target_user_id uuid,
  target_name text,
  action text,
  details jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.created_at,
    a.admin_user_id,
    COALESCE(pa.full_name, ta.display_name, ta.email)::text AS admin_name,
    a.target_user_id,
    COALESCE(pt.full_name, tt.display_name, tt.email, (a.details->>'display_name'))::text AS target_name,
    a.action,
    a.details
  FROM public.admin_audit_logs a
  LEFT JOIN public.profiles pa ON pa.user_id = a.admin_user_id
  LEFT JOIN public.profiles pt ON pt.user_id = a.target_user_id
  LEFT JOIN public.crm_team ta ON ta.user_id = a.admin_user_id
  LEFT JOIN public.crm_team tt ON tt.user_id = a.target_user_id
  WHERE public.is_crm_admin(auth.uid())
    AND a.action LIKE 'crm_team.%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.crm_team_recent_audit(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_team_recent_audit(int) TO authenticated;


-- 4. Sign-in info
CREATE OR REPLACE FUNCTION public.crm_team_member_signin_info()
RETURNS TABLE (
  user_id uuid,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.last_sign_in_at, u.created_at, u.email_confirmed_at
    FROM auth.users u
   WHERE public.is_crm_admin(auth.uid())
     AND u.id IN (SELECT user_id FROM public.crm_team WHERE user_id IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.crm_team_member_signin_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_team_member_signin_info() TO authenticated;