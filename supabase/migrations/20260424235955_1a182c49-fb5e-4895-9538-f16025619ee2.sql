-- Drop ALL partial unique indexes on event_id (PostgREST upsert can't use them)
DROP INDEX IF EXISTS public.crm_lead_behavior_views_event_id_uidx;
DROP INDEX IF EXISTS public.crm_lead_behavior_sessions_event_id_uidx;
DROP INDEX IF EXISTS public.crm_lead_behavior_forms_event_id_uidx;
DROP INDEX IF EXISTS public.crm_lead_behavior_engagement_event_id_uidx;
DROP INDEX IF EXISTS public.crm_lead_behavior_views_event_id_key;
DROP INDEX IF EXISTS public.crm_lead_behavior_sessions_event_id_key;
DROP INDEX IF EXISTS public.crm_lead_behavior_forms_event_id_key;
DROP INDEX IF EXISTS public.crm_lead_behavior_engagement_event_id_key;

-- Backfill any NULL event_ids
UPDATE public.crm_lead_behavior_views      SET event_id = gen_random_uuid()::text WHERE event_id IS NULL;
UPDATE public.crm_lead_behavior_sessions   SET event_id = gen_random_uuid()::text WHERE event_id IS NULL;
UPDATE public.crm_lead_behavior_forms      SET event_id = gen_random_uuid()::text WHERE event_id IS NULL;
UPDATE public.crm_lead_behavior_engagement SET event_id = gen_random_uuid()::text WHERE event_id IS NULL;

-- Defaults + NOT NULL
ALTER TABLE public.crm_lead_behavior_views      ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.crm_lead_behavior_sessions   ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.crm_lead_behavior_forms      ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.crm_lead_behavior_engagement ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.crm_lead_behavior_views      ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE public.crm_lead_behavior_sessions   ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE public.crm_lead_behavior_forms      ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE public.crm_lead_behavior_engagement ALTER COLUMN event_id SET NOT NULL;

-- Real, non-partial UNIQUE constraints that PostgREST upsert can target
CREATE UNIQUE INDEX crm_lead_behavior_views_event_id_unique
  ON public.crm_lead_behavior_views (event_id);
CREATE UNIQUE INDEX crm_lead_behavior_sessions_event_id_unique
  ON public.crm_lead_behavior_sessions (event_id);
CREATE UNIQUE INDEX crm_lead_behavior_forms_event_id_unique
  ON public.crm_lead_behavior_forms (event_id);
CREATE UNIQUE INDEX crm_lead_behavior_engagement_event_id_unique
  ON public.crm_lead_behavior_engagement (event_id);