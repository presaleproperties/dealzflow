CREATE OR REPLACE FUNCTION public.crm_add_tags_to_contacts(_contact_ids uuid[], _tags text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _clean_tags text[];
  _updated_count integer := 0;
BEGIN
  _clean_tags := public.normalize_crm_multi_array(_tags);

  IF COALESCE(array_length(_contact_ids, 1), 0) = 0 OR COALESCE(array_length(_clean_tags, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.crm_contacts c
  SET tags = public.normalize_crm_multi_array(COALESCE(c.tags, '{}'::text[]) || _clean_tags)
  WHERE c.id = ANY(_contact_ids)
    AND public.crm_can_see_contact(auth.uid(), c.assigned_to)
    AND public.is_crm_agent_or_above(auth.uid());

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  RETURN _updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_add_tags_to_contacts(uuid[], text[]) TO authenticated;