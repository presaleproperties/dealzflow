-- Track temp-password state on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Self-only RPC to clear the flag after the user resets their password
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.profiles
     SET must_change_password = false,
         updated_at = now()
   WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_password_changed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;