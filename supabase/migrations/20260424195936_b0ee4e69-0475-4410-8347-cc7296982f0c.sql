-- Atomically increment usage count and stamp last_used_at
CREATE OR REPLACE FUNCTION public.increment_crm_email_template_usage(_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_crm_member(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.crm_email_templates
     SET times_used = COALESCE(times_used, 0) + 1,
         last_used_at = now()
   WHERE id = _template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_crm_email_template_usage(uuid) TO authenticated;
