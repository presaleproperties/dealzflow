
-- 1. ai_usage: drop client-side write policies
DROP POLICY IF EXISTS "Users can insert their own ai usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Users can update their own ai usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Users can delete their own ai usage" ON public.ai_usage;

-- 2. Revoke EXECUTE from anon on all public SECURITY DEFINER functions.
--    Authenticated users retain access; service role is unaffected.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon;', r.nspname, r.proname, r.args);
  END LOOP;
END $$;
