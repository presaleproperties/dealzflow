-- RPC: Allow any authenticated CRM team member to set/clear their own
-- presale_email override. Bypasses the admin-only UPDATE policy via
-- SECURITY DEFINER, but only ever touches the caller's own row.
CREATE OR REPLACE FUNCTION public.set_my_presale_email(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _normalized := NULLIF(lower(btrim(_email)), '');

  -- Basic shape check; null clears the override.
  IF _normalized IS NOT NULL AND _normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  UPDATE public.crm_team
     SET presale_email = _normalized
   WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of the CRM team';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_presale_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_my_presale_email(text) TO authenticated;