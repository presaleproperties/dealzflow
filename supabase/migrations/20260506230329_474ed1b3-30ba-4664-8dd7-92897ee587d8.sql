-- 1. Drop the broad *_select_visible_contact policies that allowed
--    any authenticated user to read rows where contact_id IS NULL.
--    The companion *_select_scoped policies already grant the correct
--    access to admins/owners and the assigned agent.
DROP POLICY IF EXISTS crm_messages_select_visible_contact      ON public.crm_messages;
DROP POLICY IF EXISTS crm_conversations_select_visible_contact ON public.crm_conversations;
DROP POLICY IF EXISTS crm_tasks_select_visible_contact         ON public.crm_tasks;
DROP POLICY IF EXISTS crm_sms_log_select_visible_contact       ON public.crm_sms_log;
DROP POLICY IF EXISTS crm_email_log_select_visible_contact     ON public.crm_email_log;

-- 2. Remove the permissive fallback in crm_can_see_contact so an empty
--    or fully-deactivated crm_team can never expose all CRM data.
CREATE OR REPLACE FUNCTION public.crm_can_see_contact(_user_id uuid, _assigned_to text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team t
     WHERE t.user_id = _user_id
       AND t.is_active = true
       AND (
         t.role IN ('owner', 'admin')
         OR COALESCE((t.permissions->>'see_all_leads')::boolean, false) = true
         OR (
           _assigned_to IS NOT NULL
           AND (
             lower(_assigned_to) = lower(t.display_name)
             OR lower(_assigned_to) = ANY (SELECT lower(a) FROM unnest(t.name_aliases) AS a)
           )
         )
       )
  );
$function$;

-- 3. Add a scoped SELECT policy on crm_scheduler_payment_intents so the
--    owning agent or any CRM admin can read Stripe + invitee details.
CREATE POLICY "Agent or admin can read payment intents"
  ON public.crm_scheduler_payment_intents
  FOR SELECT
  USING (
    public.is_crm_admin(auth.uid())
    OR auth.uid() = (
      SELECT agent_user_id FROM public.crm_scheduler_bookings WHERE id = booking_id
    )
  );
