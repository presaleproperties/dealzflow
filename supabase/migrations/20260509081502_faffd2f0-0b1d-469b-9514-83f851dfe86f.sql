CREATE OR REPLACE FUNCTION public.crm_delete_contact(p_contact_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned text;
  v_exists boolean;
  v_deleted int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT assigned_to, true INTO v_assigned, v_exists
    FROM public.crm_contacts WHERE id = p_contact_id;

  IF NOT COALESCE(v_exists, false) THEN
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
$function$;