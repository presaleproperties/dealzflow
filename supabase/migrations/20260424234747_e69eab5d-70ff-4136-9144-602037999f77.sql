
-- Allow anonymous behavior rows (contact_id nullable) and stitch via presale_user_id
ALTER TABLE public.crm_lead_behavior_sessions
  ALTER COLUMN contact_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS presale_user_id text;

ALTER TABLE public.crm_lead_behavior_forms
  ALTER COLUMN contact_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS presale_user_id text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.crm_lead_behavior_engagement
  ALTER COLUMN contact_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS presale_user_id text;

ALTER TABLE public.crm_lead_behavior_views
  ALTER COLUMN contact_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_views_presale_user_id ON public.crm_lead_behavior_views(presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_presale_user_id ON public.crm_lead_behavior_sessions(presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_forms_presale_user_id ON public.crm_lead_behavior_forms(presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_engagement_presale_user_id ON public.crm_lead_behavior_engagement(presale_user_id) WHERE contact_id IS NULL;
