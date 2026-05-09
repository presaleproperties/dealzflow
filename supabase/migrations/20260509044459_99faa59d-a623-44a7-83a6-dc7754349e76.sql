CREATE OR REPLACE FUNCTION public.recalc_lead_score(_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_outbound_email   numeric := 0;
  s_inbound_email    numeric := 0;
  s_outbound_msg     numeric := 0;
  s_inbound_msg      numeric := 0;
  s_open             numeric := 0;
  s_click            numeric := 0;
  s_view             numeric := 0;
  s_session          numeric := 0;
  s_form             numeric := 0;
  s_showing          numeric := 0;
  s_note             numeric := 0;
  raw_score numeric := 0;
  final_score int := 0;
  v_email text;
  v_tags text[];
  has_hot_tag boolean := false;
  last_inbound_at timestamptz;
  last_any_at timestamptz;
  v_tier text;
  HALF_LIFE_DAYS constant numeric := 21;
BEGIN
  IF _contact_id IS NULL THEN RETURN; END IF;

  SELECT lower(email), tags INTO v_email, v_tags FROM crm_contacts WHERE id = _contact_id;

  IF v_tags IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM unnest(v_tags) t WHERE lower(btrim(t)) = 'hot') INTO has_hot_tag;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 * power(0.5, EXTRACT(EPOCH FROM (now()-sent_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    COALESCE(SUM(CASE WHEN direction='inbound'  THEN 15 * power(0.5, EXTRACT(EPOCH FROM (now()-sent_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    MAX(CASE WHEN direction='inbound' THEN sent_at END)
  INTO s_outbound_email, s_inbound_email, last_inbound_at
  FROM crm_email_log WHERE contact_id = _contact_id;

  SELECT
    COALESCE(SUM(CASE WHEN direction='outbound' THEN 1  * power(0.5, EXTRACT(EPOCH FROM (now()-created_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    COALESCE(SUM(CASE WHEN direction='inbound'  THEN 12 * power(0.5, EXTRACT(EPOCH FROM (now()-created_at))/86400.0/HALF_LIFE_DAYS) END), 0)
  INTO s_outbound_msg, s_inbound_msg
  FROM crm_messages WHERE contact_id = _contact_id;

  IF last_inbound_at IS NULL THEN
    SELECT MAX(created_at) INTO last_inbound_at
    FROM crm_messages WHERE contact_id = _contact_id AND direction='inbound';
  END IF;

  WITH dedup AS (
    SELECT type, date_trunc('hour', occurred_at) AS bucket, MIN(occurred_at) AS occurred_at
    FROM crm_activity_events
    WHERE contact_id = _contact_id
    GROUP BY type, date_trunc('hour', occurred_at)
  )
  SELECT
    COALESCE(SUM(CASE WHEN type='email_open' THEN 3 * power(0.5, EXTRACT(EPOCH FROM (now()-occurred_at))/86400.0/HALF_LIFE_DAYS) END),0),
    COALESCE(SUM(CASE WHEN type='link_click' THEN 6 * power(0.5, EXTRACT(EPOCH FROM (now()-occurred_at))/86400.0/HALF_LIFE_DAYS) END),0)
  INTO s_open, s_click
  FROM dedup;

  SELECT COALESCE(SUM(
    CASE event_type WHEN 'click' THEN 6 WHEN 'open' THEN 3 ELSE 2 END
    * power(0.5, EXTRACT(EPOCH FROM (now()-occurred_at))/86400.0/HALF_LIFE_DAYS)
  ),0)
  INTO s_click
  FROM crm_lead_behavior_engagement
  WHERE contact_id = _contact_id OR (v_email IS NOT NULL AND lower(email)=v_email);

  WITH dedup AS (
    SELECT property_id, date_trunc('day', viewed_at) AS d, MIN(viewed_at) AS viewed_at,
           MAX(COALESCE(duration_seconds,0)) AS dur
    FROM crm_lead_behavior_views
    WHERE contact_id = _contact_id OR (v_email IS NOT NULL AND lower(email)=v_email)
    GROUP BY property_id, date_trunc('day', viewed_at)
  )
  SELECT
    COALESCE(SUM(2 * power(0.5, EXTRACT(EPOCH FROM (now()-viewed_at))/86400.0/HALF_LIFE_DAYS)),0),
    COALESCE(SUM(CASE WHEN dur >= 60 THEN 4 * power(0.5, EXTRACT(EPOCH FROM (now()-viewed_at))/86400.0/HALF_LIFE_DAYS) END),0)
  INTO s_view, s_session
  FROM dedup;

  SELECT COALESCE(SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now()-submitted_at))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_form
  FROM crm_lead_behavior_forms
  WHERE contact_id = _contact_id OR (v_email IS NOT NULL AND lower(email)=v_email);

  SELECT COALESCE(SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now()-(showing_date::timestamp)::timestamptz))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_showing
  FROM crm_showings WHERE contact_id = _contact_id;

  SELECT COALESCE(SUM(2 * power(0.5, EXTRACT(EPOCH FROM (now()-COALESCE(event_at,created_at)))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_note
  FROM crm_notes
  WHERE contact_id = _contact_id AND note_type NOT IN ('import_archive','system');

  raw_score :=
      LEAST(s_outbound_email, 5)
    + LEAST(s_inbound_email,  60)
    + LEAST(s_outbound_msg,   5)
    + LEAST(s_inbound_msg,    48)
    + LEAST(s_open,           18)
    + LEAST(s_click,          24)
    + LEAST(s_view,           16)
    + LEAST(s_session,        16)
    + LEAST(s_form,           40)
    + LEAST(s_showing,        40)
    + LEAST(s_note,           10);

  final_score := LEAST(GREATEST(round(raw_score)::int, 0), 100);

  SELECT GREATEST(
    COALESCE((SELECT MAX(sent_at) FROM crm_email_log WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM crm_messages WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(occurred_at) FROM crm_activity_events WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(viewed_at) FROM crm_lead_behavior_views WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(submitted_at) FROM crm_lead_behavior_forms WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX((showing_date::timestamp)::timestamptz) FROM crm_showings WHERE contact_id = _contact_id), 'epoch'::timestamptz)
  ) INTO last_any_at;

  v_tier := CASE
    WHEN has_hot_tag THEN 'hot'  -- explicit Presale signal wins
    WHEN last_any_at < now() - interval '90 days' AND final_score < 15 THEN 'dead'
    WHEN last_inbound_at IS NOT NULL AND last_inbound_at > now() - interval '14 days' THEN 'hot'
    WHEN final_score >= 70 THEN 'hot'
    WHEN final_score >= 40 THEN 'warm'
    WHEN final_score >= 15 THEN 'lukewarm'
    WHEN final_score >  0  THEN 'cold'
    ELSE 'dead'
  END;

  UPDATE crm_contacts
  SET lead_score = final_score,
      lead_tier  = v_tier
  WHERE id = _contact_id;
END;
$function$;