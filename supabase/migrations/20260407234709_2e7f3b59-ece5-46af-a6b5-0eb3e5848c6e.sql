
-- Remove client SELECT on google_calendar_tokens
-- Edge functions use service_role and don't need client RLS policies
DROP POLICY IF EXISTS "Users can read own tokens" ON public.google_calendar_tokens;
