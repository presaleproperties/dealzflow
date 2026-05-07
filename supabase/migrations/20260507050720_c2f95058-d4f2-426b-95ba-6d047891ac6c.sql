-- Backfill: expand existing behavior_batch crm_activity_events into
-- the proper behavior tables and refresh the lead's projects/last_activity.
-- This catches events received before receive-presale-activity was fixed.

WITH src AS (
  SELECT
    e.id            AS event_id,
    e.contact_id,
    e.lead_email    AS email,
    e.occurred_at,
    e.metadata      AS meta,
    COALESCE(e.metadata->>'presale_user_id', e.metadata->>'visitor_id') AS presale_user_id,
    e.metadata->'behavior' AS behavior
  FROM public.crm_activity_events e
  WHERE e.type = 'behavior_batch'
    AND e.contact_id IS NOT NULL
    AND e.metadata ? 'behavior'
),
forms_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'forms','[]'::jsonb)) AS f
  FROM src s
),
views_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'views','[]'::jsonb)) AS v
  FROM src s
),
sessions_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'sessions','[]'::jsonb)) AS se
  FROM src s
),
eng_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'engagement','[]'::jsonb)) AS g
  FROM src s
)
-- Forms
INSERT INTO public.crm_lead_behavior_forms
  (event_id, contact_id, presale_user_id, email, form_type, form_name, status,
   property_id, property_name, payload, funnel_step, funnel_total_steps, submitted_at)
SELECT
  COALESCE(f->>'event_id',
           contact_id::text || ':form:' || COALESCE(f->>'form_type','') || ':' || COALESCE(f->>'submitted_at','')),
  contact_id, presale_user_id, email,
  COALESCE(f->>'form_type','unknown'),
  f->>'form_name',
  f->>'status',
  f->>'property_id',
  f->>'property_name',
  f,
  NULLIF(f->>'funnel_step','')::int,
  NULLIF(f->>'funnel_total_steps','')::int,
  COALESCE(NULLIF(f->>'submitted_at','')::timestamptz, occurred_at)
FROM forms_src
ON CONFLICT (event_id) DO NOTHING;

WITH src AS (
  SELECT e.id, e.contact_id, e.lead_email AS email, e.occurred_at,
         COALESCE(e.metadata->>'presale_user_id', e.metadata->>'visitor_id') AS presale_user_id,
         e.metadata->'behavior' AS behavior
  FROM public.crm_activity_events e
  WHERE e.type='behavior_batch' AND e.contact_id IS NOT NULL AND e.metadata ? 'behavior'
),
views_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'views','[]'::jsonb)) AS v
  FROM src s
)
INSERT INTO public.crm_lead_behavior_views
  (event_id, contact_id, presale_user_id, email, property_id, property_name,
   property_url, action, duration_seconds, metadata, viewed_at)
SELECT
  COALESCE(v->>'event_id',
           contact_id::text || ':view:' || COALESCE(v->>'property_id', v->>'property_url','') || ':' || COALESCE(v->>'viewed_at','')),
  contact_id, presale_user_id, email,
  v->>'property_id', v->>'property_name', v->>'property_url',
  COALESCE(v->>'action','view'),
  COALESCE(NULLIF(v->>'duration_seconds','')::int, 0),
  v->'metadata',
  COALESCE(NULLIF(v->>'viewed_at','')::timestamptz, occurred_at)
FROM views_src
ON CONFLICT (event_id) DO NOTHING;

WITH src AS (
  SELECT e.id, e.contact_id, e.lead_email AS email, e.occurred_at,
         COALESCE(e.metadata->>'presale_user_id', e.metadata->>'visitor_id') AS presale_user_id,
         e.metadata->'behavior' AS behavior
  FROM public.crm_activity_events e
  WHERE e.type='behavior_batch' AND e.contact_id IS NOT NULL AND e.metadata ? 'behavior'
),
sessions_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'sessions','[]'::jsonb)) AS se
  FROM src s
)
INSERT INTO public.crm_lead_behavior_sessions
  (event_id, contact_id, presale_user_id, email, session_id, pages_viewed,
   duration_seconds, referrer, utm_source, utm_medium, utm_campaign,
   device_type, landing_page, exit_page, started_at, ended_at)
SELECT
  COALESCE(se->>'event_id',
           contact_id::text || ':session:' || COALESCE(se->>'session_id', se->>'started_at','')),
  contact_id, presale_user_id, email,
  se->>'session_id',
  COALESCE(NULLIF(se->>'pages_viewed','')::int, 0),
  COALESCE(NULLIF(se->>'duration_seconds','')::int, 0),
  se->>'referrer', se->>'utm_source', se->>'utm_medium', se->>'utm_campaign',
  se->>'device_type', se->>'landing_page', se->>'exit_page',
  COALESCE(NULLIF(se->>'started_at','')::timestamptz, occurred_at),
  NULLIF(se->>'ended_at','')::timestamptz
FROM sessions_src
ON CONFLICT (event_id) DO NOTHING;

WITH src AS (
  SELECT e.id, e.contact_id, e.lead_email AS email, e.occurred_at,
         COALESCE(e.metadata->>'presale_user_id', e.metadata->>'visitor_id') AS presale_user_id,
         e.metadata->'behavior' AS behavior
  FROM public.crm_activity_events e
  WHERE e.type='behavior_batch' AND e.contact_id IS NOT NULL AND e.metadata ? 'behavior'
),
eng_src AS (
  SELECT s.*, jsonb_array_elements(COALESCE(s.behavior->'engagement','[]'::jsonb)) AS g
  FROM src s
)
INSERT INTO public.crm_lead_behavior_engagement
  (event_id, contact_id, presale_user_id, email, event_type, campaign_id,
   campaign_name, template_id, template_name, link_url, metadata, occurred_at)
SELECT
  COALESCE(g->>'event_id',
           contact_id::text || ':eng:' || COALESCE(g->>'event_type','') || ':' || COALESCE(g->>'occurred_at','') || ':' || COALESCE(g->>'link_url','')),
  contact_id, presale_user_id, email,
  COALESCE(g->>'event_type','unknown'),
  g->>'campaign_id', g->>'campaign_name',
  g->>'template_id', g->>'template_name',
  g->>'link_url',
  g->'metadata',
  COALESCE(NULLIF(g->>'occurred_at','')::timestamptz, occurred_at)
FROM eng_src
ON CONFLICT (event_id) DO NOTHING;

-- Refresh contact projects/last_activity from any backfilled property names
WITH agg AS (
  SELECT
    e.contact_id,
    array_agg(DISTINCT v->>'property_name') FILTER (WHERE v->>'property_name' IS NOT NULL) AS view_projects,
    array_agg(DISTINCT f->>'property_name') FILTER (WHERE f->>'property_name' IS NOT NULL) AS form_projects,
    max(e.occurred_at) AS last_at
  FROM public.crm_activity_events e
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.metadata->'behavior'->'views','[]'::jsonb)) v ON true
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.metadata->'behavior'->'forms','[]'::jsonb)) f ON true
  WHERE e.type='behavior_batch' AND e.contact_id IS NOT NULL
  GROUP BY e.contact_id
)
UPDATE public.crm_contacts c
SET projects = (
      SELECT array_agg(DISTINCT x) FROM unnest(
        COALESCE(c.projects,'{}') || COALESCE(a.view_projects,'{}') || COALESCE(a.form_projects,'{}')
      ) AS x WHERE x IS NOT NULL
    ),
    project = COALESCE(NULLIF(c.project,''), (COALESCE(a.form_projects, a.view_projects))[1]),
    last_activity_at = GREATEST(COALESCE(c.last_activity_at, 'epoch'::timestamptz), a.last_at),
    ai_summary_stale = true
FROM agg a
WHERE a.contact_id = c.id;