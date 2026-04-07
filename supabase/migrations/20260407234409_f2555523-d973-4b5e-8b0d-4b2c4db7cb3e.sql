
-- Restore google_calendar_tokens SELECT policy (needed by edge functions that use user context)
CREATE POLICY "Users can read own tokens"
  ON public.google_calendar_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
