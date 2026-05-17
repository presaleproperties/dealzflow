ALTER TABLE public.crm_zara_settings
  ADD COLUMN IF NOT EXISTS auto_showcase_triggers text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS auto_showcase_count integer NOT NULL DEFAULT 3;

ALTER TABLE public.crm_zara_settings
  ADD CONSTRAINT crm_zara_settings_auto_showcase_count_chk
  CHECK (auto_showcase_count BETWEEN 1 AND 5);