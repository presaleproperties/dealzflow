
CREATE OR REPLACE FUNCTION public._touch_skip_enabled()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(current_setting('app.skip_touch', true), 'off') = 'on';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
