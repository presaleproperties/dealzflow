-- 1) Revoke EXECUTE from anon on all functions in public schema
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
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                   r.func_name, r.args);
  END LOOP;
END $$;

-- 2) Restrict decrypt_api_credential to service_role only
REVOKE EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_credential(text, text) TO service_role;

-- 3) Same lock-down for encrypt_api_credential — only the server should call it
REVOKE EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_api_credential(text, text) TO service_role;