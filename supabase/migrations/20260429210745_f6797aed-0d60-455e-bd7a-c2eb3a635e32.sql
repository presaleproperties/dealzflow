-- crm_email_threads
DROP POLICY IF EXISTS "CRM members can view email threads" ON public.crm_email_threads;
CREATE POLICY "crm_email_threads_select_visible_contact"
  ON public.crm_email_threads FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
    OR (contact_id IS NULL AND user_id = auth.uid())
  );

-- crm_activity_events
DROP POLICY IF EXISTS "CRM members can read activity events" ON public.crm_activity_events;
CREATE POLICY "crm_activity_events_select_visible_contact"
  ON public.crm_activity_events FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

-- crm_email_jobs
DROP POLICY IF EXISTS "crm members read jobs" ON public.crm_email_jobs;
CREATE POLICY "crm_email_jobs_select_visible_contact"
  ON public.crm_email_jobs FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

-- crm_email_send_jobs (mass-send jobs — owned by initiator)
DROP POLICY IF EXISTS "CRM members can view email send jobs" ON public.crm_email_send_jobs;
CREATE POLICY "crm_email_send_jobs_select_own"
  ON public.crm_email_send_jobs FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- crm_email_send_log
DROP POLICY IF EXISTS "crm members read send log" ON public.crm_email_send_log;
CREATE POLICY "crm_email_send_log_select_visible_contact"
  ON public.crm_email_send_log FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

-- crm_email_schedule
DROP POLICY IF EXISTS "CRM members can view scheduled emails" ON public.crm_email_schedule;
CREATE POLICY "crm_email_schedule_select_visible_contact"
  ON public.crm_email_schedule FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

-- crm_whatsapp_messages (no contact_id; fall back to author)
DROP POLICY IF EXISTS "CRM members can view messages" ON public.crm_whatsapp_messages;
CREATE POLICY "crm_whatsapp_messages_select_own"
  ON public.crm_whatsapp_messages FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR user_id = auth.uid()
  );