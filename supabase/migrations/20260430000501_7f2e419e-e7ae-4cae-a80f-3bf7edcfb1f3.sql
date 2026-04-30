-- Allow agents to reassign their own leads. The previous WITH CHECK
-- recomputed visibility against the NEW assigned_to, which made handoffs
-- impossible for non-admin agents (they lose access the moment the row
-- changes hands). We keep USING strict (only see your own leads) but
-- relax WITH CHECK so any active CRM agent can persist an update on a
-- row they were already allowed to open.
DROP POLICY IF EXISTS crm_contacts_update_assigned ON public.crm_contacts;

CREATE POLICY crm_contacts_update_assigned
ON public.crm_contacts
FOR UPDATE
USING (public.crm_can_see_contact(auth.uid(), assigned_to))
WITH CHECK (public.is_crm_agent_or_above(auth.uid()));