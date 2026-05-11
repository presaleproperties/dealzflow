
REVOKE EXECUTE ON FUNCTION public.crm_backfill_orphan_activity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_contacts_backfill_activity_trg() FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_find_existing_conversation(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_identities_backfill_activity_trg() FROM anon;

ALTER FUNCTION public.crm_backfill_orphan_activity(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_contacts_backfill_activity_trg() SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_find_existing_conversation(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.crm_identities_backfill_activity_trg() SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "CRM members can view conversations" ON public.crm_whatsapp_conversations;
CREATE POLICY "CRM members can view conversations (assigned)"
  ON public.crm_whatsapp_conversations
  FOR SELECT
  USING (
    public.is_crm_member(auth.uid())
    AND (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

DROP POLICY IF EXISTS "CRM agents+ can update conversations" ON public.crm_whatsapp_conversations;
CREATE POLICY "CRM agents+ can update conversations (assigned)"
  ON public.crm_whatsapp_conversations
  FOR UPDATE
  USING (
    public.is_crm_member(auth.uid())
    AND (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

DROP POLICY IF EXISTS "CRM members view link clicks" ON public.crm_timeline_link_clicks;
CREATE POLICY "CRM members view link clicks (assigned)"
  ON public.crm_timeline_link_clicks
  FOR SELECT
  USING (
    public.is_crm_member(auth.uid())
    AND (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id))
  );
