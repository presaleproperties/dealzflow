CREATE OR REPLACE FUNCTION public.is_crm_admin_or_owner(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.crm_team WHERE user_id = _uid AND role IN ('owner','admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.is_crm_admin_or_owner(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_crm_admin_or_owner(uuid) TO authenticated;

-- crm_messages: NULL contact => admins only
DROP POLICY IF EXISTS "CRM members can view messages" ON public.crm_messages;
DROP POLICY IF EXISTS "crm_messages_select" ON public.crm_messages;
CREATE POLICY "crm_messages_select_scoped" ON public.crm_messages
FOR SELECT TO authenticated
USING (
  public.is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

-- crm_conversations: NULL contact => admins only
DROP POLICY IF EXISTS "CRM members can view conversations" ON public.crm_conversations;
DROP POLICY IF EXISTS "crm_conversations_select" ON public.crm_conversations;
CREATE POLICY "crm_conversations_select_scoped" ON public.crm_conversations
FOR SELECT TO authenticated
USING (
  public.is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

-- crm_tasks: NULL contact => admins only
DROP POLICY IF EXISTS "CRM members can view tasks" ON public.crm_tasks;
DROP POLICY IF EXISTS "crm_tasks_select" ON public.crm_tasks;
CREATE POLICY "crm_tasks_select_scoped" ON public.crm_tasks
FOR SELECT TO authenticated
USING (
  public.is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

-- crm_sms_log: NULL contact => admins or row owner (user_id)
DROP POLICY IF EXISTS "CRM members can view sms log" ON public.crm_sms_log;
DROP POLICY IF EXISTS "crm_sms_log_select" ON public.crm_sms_log;
CREATE POLICY "crm_sms_log_select_scoped" ON public.crm_sms_log
FOR SELECT TO authenticated
USING (
  public.is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  OR (contact_id IS NULL AND user_id = auth.uid())
);

-- crm_email_log: NULL contact => admins or row owner (user_id)
DROP POLICY IF EXISTS "CRM members can view email log" ON public.crm_email_log;
DROP POLICY IF EXISTS "crm_email_log_select" ON public.crm_email_log;
CREATE POLICY "crm_email_log_select_scoped" ON public.crm_email_log
FOR SELECT TO authenticated
USING (
  public.is_crm_admin_or_owner(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  OR (contact_id IS NULL AND user_id = auth.uid())
);

-- Storage: crm-assets upload requires CRM membership
DROP POLICY IF EXISTS "Authenticated users can upload crm-assets" ON storage.objects;
DROP POLICY IF EXISTS "crm_assets_insert" ON storage.objects;
CREATE POLICY "crm_assets_insert_members" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'crm-assets' AND public.is_crm_member(auth.uid()));

-- Storage: email-attachments per-folder read (admins all)
DROP POLICY IF EXISTS "CRM members can read email-attachments" ON storage.objects;
DROP POLICY IF EXISTS "email_attachments_select" ON storage.objects;
CREATE POLICY "email_attachments_select_own_folder" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND (
    public.is_crm_admin_or_owner(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Lock down internal-only SECURITY DEFINER functions from authenticated role
DO $$
DECLARE
  fn record;
  keep_callable text[] := ARRAY[
    'has_role','is_admin','is_crm_member','is_crm_admin_or_owner',
    'crm_can_see_contact_id','crm_can_see_contact','crm_my_presale_slug',
    'crm_recipients_for_contact','crm_find_my_duplicates',
    'admin_set_workspace_status','set_my_presale_email'
  ];
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY(keep_callable))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated;',
      fn.nspname, fn.proname, fn.args
    );
  END LOOP;
END $$;