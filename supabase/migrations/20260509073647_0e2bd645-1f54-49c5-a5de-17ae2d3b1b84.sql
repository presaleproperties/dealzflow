-- 1) Cascade FK on crm_messages so contact deletion succeeds.
ALTER TABLE public.crm_messages
  DROP CONSTRAINT IF EXISTS crm_messages_contact_id_fkey;

ALTER TABLE public.crm_messages
  ADD CONSTRAINT crm_messages_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;

-- 2) Server-side delete helper with explicit permission check.
CREATE OR REPLACE FUNCTION public.crm_delete_contact(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_deleted int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT assigned_to INTO v_assigned
    FROM public.crm_contacts WHERE id = p_contact_id;

  IF v_assigned IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_contacts WHERE id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF NOT public.crm_has_perm(auth.uid(), 'delete_leads') THEN
    RAISE EXCEPTION 'You do not have permission to delete leads';
  END IF;

  IF NOT public.crm_can_see_contact(auth.uid(), v_assigned) THEN
    RAISE EXCEPTION 'You cannot delete a lead assigned to another agent';
  END IF;

  DELETE FROM public.crm_contacts WHERE id = p_contact_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_delete_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_delete_contact(uuid) TO authenticated;
