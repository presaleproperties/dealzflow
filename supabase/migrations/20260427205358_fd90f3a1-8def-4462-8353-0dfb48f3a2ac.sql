DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                   r.func_name, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                   r.func_name, r.args);
  END LOOP;
END $$;

-- Re-affirm decrypt/encrypt restrictions (PUBLIC was the culprit)
REVOKE EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) TO service_role;