
-- 1. Dedupe existing behavior_forms (keep earliest per natural key)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY contact_id, form_type, submitted_at
           ORDER BY created_at ASC
         ) AS rn
  FROM public.crm_lead_behavior_forms
  WHERE contact_id IS NOT NULL
)
DELETE FROM public.crm_lead_behavior_forms f
USING ranked r
WHERE f.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY contact_id, COALESCE(property_id::text, property_url, ''), viewed_at
           ORDER BY created_at ASC
         ) AS rn
  FROM public.crm_lead_behavior_views
  WHERE contact_id IS NOT NULL
)
DELETE FROM public.crm_lead_behavior_views v
USING ranked r
WHERE v.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY contact_id, COALESCE(session_id, ''), started_at
           ORDER BY created_at ASC
         ) AS rn
  FROM public.crm_lead_behavior_sessions
  WHERE contact_id IS NOT NULL
)
DELETE FROM public.crm_lead_behavior_sessions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 2. Add unique indexes that the upserts can target
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_forms_dedupe_idx
  ON public.crm_lead_behavior_forms (contact_id, form_type, submitted_at)
  WHERE contact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_views_dedupe_idx
  ON public.crm_lead_behavior_views (contact_id, COALESCE(property_id::text, property_url, ''), viewed_at)
  WHERE contact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_behavior_sessions_dedupe_idx
  ON public.crm_lead_behavior_sessions (contact_id, COALESCE(session_id, ''), started_at)
  WHERE contact_id IS NOT NULL;

-- 3. Make write_behavior_note idempotent: skip if same content already exists for this contact+kind within 1 minute
CREATE OR REPLACE FUNCTION public.write_behavior_note(_contact_id uuid, _kind text, _body text, _event_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _evt timestamptz := COALESCE(_event_at, now());
  _exists boolean;
BEGIN
  IF _contact_id IS NULL OR _body IS NULL OR length(btrim(_body)) = 0 THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.crm_notes
    WHERE contact_id = _contact_id
      AND note_type = _kind
      AND content = _body
      AND event_at BETWEEN _evt - interval '2 minutes' AND _evt + interval '2 minutes'
  ) INTO _exists;

  IF _exists THEN RETURN; END IF;

  INSERT INTO public.crm_notes (contact_id, user_id, content, note_type, event_at, is_pinned, created_at)
  SELECT _contact_id,
         (SELECT user_id FROM public.crm_team WHERE is_active = true ORDER BY created_at LIMIT 1),
         _body, _kind, _evt, false, now();
END;
$function$;

-- 4. Clean up existing duplicate notes (keep earliest per content+contact+type+minute)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY contact_id, note_type, content, date_trunc('minute', event_at)
           ORDER BY created_at ASC
         ) AS rn
  FROM public.crm_notes
  WHERE note_type IN ('presale_form','presale_view','presale_session','presale_engagement')
)
DELETE FROM public.crm_notes n
USING ranked r
WHERE n.id = r.id AND r.rn > 1;
