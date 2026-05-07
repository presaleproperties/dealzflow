
-- 1) Add lead_tier column
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS lead_tier text;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_tier ON public.crm_contacts(lead_tier);

-- 2) Rewrite recalc with time-decay + engagement signals
CREATE OR REPLACE FUNCTION public.recalc_lead_score(_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- decayed weighted sums (per signal)
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
  last_inbound_at timestamptz;
  last_any_at timestamptz;
  v_tier text;

  HALF_LIFE_DAYS constant numeric := 21;
BEGIN
  IF _contact_id IS NULL THEN RETURN; END IF;

  SELECT lower(email) INTO v_email FROM crm_contacts WHERE id = _contact_id;

  -- Helper: each row contributes (base * 0.5^(age_days / 21))
  -- We sum decayed contributions per channel, then cap each channel.

  -- Emails (inbound replies dominate, outbound near-zero)
  SELECT
    COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 * power(0.5, EXTRACT(EPOCH FROM (now()-sent_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    COALESCE(SUM(CASE WHEN direction='inbound'  THEN 15 * power(0.5, EXTRACT(EPOCH FROM (now()-sent_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    MAX(CASE WHEN direction='inbound' THEN sent_at END)
  INTO s_outbound_email, s_inbound_email, last_inbound_at
  FROM crm_email_log WHERE contact_id = _contact_id;

  -- SMS / WhatsApp via crm_messages
  SELECT
    COALESCE(SUM(CASE WHEN direction='outbound' THEN 1  * power(0.5, EXTRACT(EPOCH FROM (now()-created_at))/86400.0/HALF_LIFE_DAYS) END), 0),
    COALESCE(SUM(CASE WHEN direction='inbound'  THEN 12 * power(0.5, EXTRACT(EPOCH FROM (now()-created_at))/86400.0/HALF_LIFE_DAYS) END), 0)
  INTO s_outbound_msg, s_inbound_msg
  FROM crm_messages WHERE contact_id = _contact_id;

  IF last_inbound_at IS NULL THEN
    SELECT MAX(created_at) INTO last_inbound_at
    FROM crm_messages WHERE contact_id = _contact_id AND direction='inbound';
  END IF;

  -- Opens & clicks from crm_activity_events (dedupe by (type, day) so a single
  -- email open scanned 10x doesn't run away)
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

  -- Engagement events from presale (clicks, opens fed in via behavior_engagement)
  SELECT COALESCE(SUM(
    CASE event_type
      WHEN 'click' THEN 6
      WHEN 'open'  THEN 3
      ELSE 2
    END * power(0.5, EXTRACT(EPOCH FROM (now()-occurred_at))/86400.0/HALF_LIFE_DAYS)
  ),0)
  INTO s_click
  FROM crm_lead_behavior_engagement
  WHERE contact_id = _contact_id OR (v_email IS NOT NULL AND lower(email)=v_email);
  -- (s_click overwritten if behavior present — both sources roll into clicks)

  -- Property views (per-day dedup so refresh-spam doesn't dominate)
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

  -- Form submissions (high intent)
  SELECT COALESCE(SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now()-submitted_at))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_form
  FROM crm_lead_behavior_forms
  WHERE contact_id = _contact_id OR (v_email IS NOT NULL AND lower(email)=v_email);

  -- Showings
  SELECT COALESCE(SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now()-(showing_date::timestamp)::timestamptz))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_showing
  FROM crm_showings WHERE contact_id = _contact_id;

  -- Notes (low weight, capped) — only manual ones
  SELECT COALESCE(SUM(2 * power(0.5, EXTRACT(EPOCH FROM (now()-COALESCE(event_at,created_at)))/86400.0/HALF_LIFE_DAYS)),0)
  INTO s_note
  FROM crm_notes
  WHERE contact_id = _contact_id AND note_type NOT IN ('import_archive','system');

  -- Apply per-channel caps then sum
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

  -- Compute last_any_at (for dead detection)
  SELECT GREATEST(
    COALESCE((SELECT MAX(sent_at) FROM crm_email_log WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM crm_messages WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(occurred_at) FROM crm_activity_events WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(viewed_at) FROM crm_lead_behavior_views WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(submitted_at) FROM crm_lead_behavior_forms WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX((showing_date::timestamp)::timestamptz) FROM crm_showings WHERE contact_id = _contact_id), 'epoch'::timestamptz)
  ) INTO last_any_at;

  -- Tier (replied recently => hot floor; no activity in 90d => dead)
  v_tier := CASE
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
$$;

-- 3) recalc_all_lead_scores already exists — make sure it works with new fn
CREATE OR REPLACE FUNCTION public.recalc_all_lead_scores()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM crm_contacts LOOP
    PERFORM recalc_lead_score(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- 4) New trigger functions for engagement + behavior tables
CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    PERFORM recalc_lead_score(NEW.contact_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_behavior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    PERFORM recalc_lead_score(NEW.contact_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_score_activity ON crm_activity_events;
CREATE TRIGGER trg_lead_score_activity
  AFTER INSERT ON crm_activity_events
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_lead_score_activity();

DROP TRIGGER IF EXISTS trg_lead_score_behavior_forms ON crm_lead_behavior_forms;
CREATE TRIGGER trg_lead_score_behavior_forms
  AFTER INSERT ON crm_lead_behavior_forms
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_lead_score_behavior();

DROP TRIGGER IF EXISTS trg_lead_score_behavior_views ON crm_lead_behavior_views;
CREATE TRIGGER trg_lead_score_behavior_views
  AFTER INSERT ON crm_lead_behavior_views
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_lead_score_behavior();

DROP TRIGGER IF EXISTS trg_lead_score_behavior_engagement ON crm_lead_behavior_engagement;
CREATE TRIGGER trg_lead_score_behavior_engagement
  AFTER INSERT ON crm_lead_behavior_engagement
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_lead_score_behavior();

-- 5) Nightly decay cron (re-runs all leads so scores naturally drop)
DO $$ BEGIN
  PERFORM cron.unschedule('crm-recalc-all-lead-scores');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crm-recalc-all-lead-scores',
  '15 3 * * *',
  $cron$ SELECT public.recalc_all_lead_scores(); $cron$
);
