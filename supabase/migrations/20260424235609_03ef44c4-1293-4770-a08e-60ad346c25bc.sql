-- Add unique indexes on event_id for behavior tables so ON CONFLICT upserts work in bridge-ingest-behavior.
-- Partial indexes (WHERE event_id IS NOT NULL) since event_id is optional.

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_views_event_id_uidx
  ON public.crm_lead_behavior_views (event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_sessions_event_id_uidx
  ON public.crm_lead_behavior_sessions (event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_forms_event_id_uidx
  ON public.crm_lead_behavior_forms (event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_engagement_event_id_uidx
  ON public.crm_lead_behavior_engagement (event_id)
  WHERE event_id IS NOT NULL;

-- Helpful lookup indexes for the lead detail timeline
CREATE INDEX IF NOT EXISTS crm_lead_behavior_views_contact_id_idx
  ON public.crm_lead_behavior_views (contact_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_behavior_sessions_contact_id_idx
  ON public.crm_lead_behavior_sessions (contact_id, started_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_behavior_forms_contact_id_idx
  ON public.crm_lead_behavior_forms (contact_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_behavior_engagement_contact_id_idx
  ON public.crm_lead_behavior_engagement (contact_id, occurred_at DESC);

-- Same for presale_user_id stitching lookups
CREATE INDEX IF NOT EXISTS crm_lead_behavior_views_presale_user_idx
  ON public.crm_lead_behavior_views (presale_user_id) WHERE presale_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_behavior_sessions_presale_user_idx
  ON public.crm_lead_behavior_sessions (presale_user_id) WHERE presale_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_behavior_forms_presale_user_idx
  ON public.crm_lead_behavior_forms (presale_user_id) WHERE presale_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_behavior_engagement_presale_user_idx
  ON public.crm_lead_behavior_engagement (presale_user_id) WHERE presale_user_id IS NOT NULL;