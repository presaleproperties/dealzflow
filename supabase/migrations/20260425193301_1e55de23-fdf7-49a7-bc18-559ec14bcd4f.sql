CREATE OR REPLACE FUNCTION public.crm_funnel_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz := now() - interval '30 days';
BEGIN
  IF NOT public.is_crm_member(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'never_touched',    COUNT(*) FILTER (WHERE status = 'New Lead' AND last_touch_at IS NULL),
    'cold_30d',         COUNT(*) FILTER (WHERE status = 'New Lead' AND (last_touch_at IS NULL OR last_touch_at < v_cutoff)),
    'new_total',        COUNT(*) FILTER (WHERE status = 'New Lead'),
    'contacted_total',  COUNT(*) FILTER (WHERE status = 'Contacted'),
    'hot_total',        COUNT(*) FILTER (WHERE status = 'Hot / Engaged'),
    'showing_total',    COUNT(*) FILTER (WHERE status = 'Showing Booked'),
    'closed_total',     COUNT(*) FILTER (WHERE status = 'Closed'),
    'total',            COUNT(*)
  ) INTO v_result
  FROM public.crm_contacts;

  RETURN v_result;
END;
$$;