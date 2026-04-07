
-- Add missing INSERT and UPDATE policies for google_calendar_tokens
CREATE POLICY "Users can insert own tokens"
  ON public.google_calendar_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.google_calendar_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
