-- Revoke EXECUTE from authenticated on all trigger functions in public.
-- A function is a trigger function if its return type is `trigger`.
-- Triggers fire as table owner, so revoking from `authenticated` does NOT break them.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND t.typname = 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, anon, PUBLIC',
                   r.func_name, r.args);
  END LOOP;
END $$;

-- Also revoke from authenticated on internal helpers that should never be called directly via PostgREST.
-- These are used inside RLS policies / other functions — RLS uses the function's SECURITY DEFINER context, not the caller's grant.
REVOKE EXECUTE ON FUNCTION public._touch_skip_enabled() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._backfill_behavior_notes_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_behavior_note(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_crm(uuid[], text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_recipients_for_contact(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_phone_opted_out(text) FROM PUBLIC, anon, authenticated;