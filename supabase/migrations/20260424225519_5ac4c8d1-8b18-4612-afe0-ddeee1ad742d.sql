
-- Add event_id for idempotency on all 4 behavior tables
ALTER TABLE public.crm_lead_behavior_views
  ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_views_event_id_key
  ON public.crm_lead_behavior_views(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.crm_lead_behavior_sessions
  ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_sessions_event_id_key
  ON public.crm_lead_behavior_sessions(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.crm_lead_behavior_forms
  ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_forms_event_id_key
  ON public.crm_lead_behavior_forms(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.crm_lead_behavior_engagement
  ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_engagement_event_id_key
  ON public.crm_lead_behavior_engagement(event_id) WHERE event_id IS NOT NULL;
