-- 1. Unschedule failing Lofty cron (token invalid; burning invocations)
DO $$ BEGIN
  PERFORM cron.unschedule('lofty-pull-leads');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. Drop orphan email queue table (replaced by crm_email_schedule + crm_email_send_jobs)
DROP TABLE IF EXISTS public.crm_email_jobs CASCADE;

-- 3. Lock down admin-only SECURITY DEFINER RPCs.
--    These functions perform privileged actions and must NOT be callable by anon.
--    Internal callers use service_role; UI calls them through authenticated sessions
--    after role checks inside the function body. Re-grant to authenticated for that path.
REVOKE EXECUTE ON FUNCTION public.admin_set_workspace_status(uuid, workspace_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_link_crm_team_to_user(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_team_admin_update_member(uuid, text, text, text, text, text, smallint, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_team_update(uuid, text, jsonb, boolean, text[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_workspace_status(uuid, workspace_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_link_crm_team_to_user(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_team_admin_update_member(uuid, text, text, text, text, text, smallint, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_team_update(uuid, text, jsonb, boolean, text[]) TO authenticated, service_role;

-- 4. Public buckets: keep public read of known URLs, but block anonymous LISTING
--    by ensuring no SELECT policy exists for anon on storage.objects for these buckets.
--    Public CDN reads bypass RLS, so files remain accessible by direct URL.
DO $$ BEGIN
  -- Drop any overly permissive "public listing" policies on these buckets if present
  EXECUTE 'DROP POLICY IF EXISTS "Public can list avatars" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Public can list brand-logos" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Public can list crm-team-headshots" ON storage.objects';
EXCEPTION WHEN OTHERS THEN NULL; END $$;