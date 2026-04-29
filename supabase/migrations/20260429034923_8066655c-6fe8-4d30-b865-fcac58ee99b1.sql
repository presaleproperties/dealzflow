-- Per-step completion map + identity fields collected during onboarding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_no text,
  ADD COLUMN IF NOT EXISTS brokerage text,
  ADD COLUMN IF NOT EXISTS province text;

-- Index for admin reporting
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed_at
  ON public.profiles (onboarding_completed_at);

-- Helper: returns 0-100 percentage of completed onboarding steps
CREATE OR REPLACE FUNCTION public.profile_onboarding_progress(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_steps jsonb;
  v_is_crm boolean;
  v_total int;
  v_done int := 0;
  v_keys text[];
  k text;
BEGIN
  SELECT onboarding_steps INTO v_steps
    FROM public.profiles WHERE user_id = _user_id;
  IF v_steps IS NULL THEN RETURN 0; END IF;

  v_is_crm := public.is_crm_member(_user_id);
  -- 6 core steps for everyone
  v_keys := ARRAY['welcome','profile','province','rezen','google','signature','push'];
  -- 3 extra CRM steps when applicable
  IF v_is_crm THEN
    v_keys := v_keys || ARRAY['crm_sources','crm_sms','crm_tour'];
  END IF;

  v_total := array_length(v_keys, 1);
  FOREACH k IN ARRAY v_keys LOOP
    IF (v_steps ->> k) = 'true' THEN
      v_done := v_done + 1;
    END IF;
  END LOOP;

  RETURN GREATEST(0, LEAST(100, (v_done * 100) / v_total));
END;
$$;