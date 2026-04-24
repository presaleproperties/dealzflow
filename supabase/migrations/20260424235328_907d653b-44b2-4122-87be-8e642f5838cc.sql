
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_views_event_id_uidx ON public.crm_lead_behavior_views(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_sessions_event_id_uidx ON public.crm_lead_behavior_sessions(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_forms_event_id_uidx ON public.crm_lead_behavior_forms(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_engagement_event_id_uidx ON public.crm_lead_behavior_engagement(event_id) WHERE event_id IS NOT NULL;
