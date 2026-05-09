
-- ── crm_contacts: scoring + visit tracking ───────────────────────────────
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS engagement_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_score_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_engagement_score
  ON public.crm_contacts (engagement_score DESC, last_activity_at DESC NULLS LAST);

-- ── crm_team: quiet hours ────────────────────────────────────────────────
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS quiet_hours_start smallint,
  ADD COLUMN IF NOT EXISTS quiet_hours_end smallint,
  ADD COLUMN IF NOT EXISTS quiet_hours_tz text NOT NULL DEFAULT 'America/Vancouver';

ALTER TABLE public.crm_team
  ADD CONSTRAINT crm_team_quiet_start_chk CHECK (quiet_hours_start IS NULL OR quiet_hours_start BETWEEN 0 AND 23),
  ADD CONSTRAINT crm_team_quiet_end_chk   CHECK (quiet_hours_end   IS NULL OR quiet_hours_end   BETWEEN 0 AND 23);

-- ── crm_notifications: dedupe + tiering ──────────────────────────────────
ALTER TABLE public.crm_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_notifications_user_dedupe
  ON public.crm_notifications (user_id, dedupe_key, created_at DESC) WHERE dedupe_key IS NOT NULL;

-- ── crm_notification_dedupe (TTL store) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_notification_dedupe (
  user_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, dedupe_key)
);
ALTER TABLE public.crm_notification_dedupe ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_notification_dedupe' AND policyname='no_client_access') THEN
    CREATE POLICY "no_client_access" ON public.crm_notification_dedupe FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ── Engagement score function ────────────────────────────────────────────
-- Rolling 0..100 with 14-day half-life decay.
-- Per event: view=1, session=3, form=10, deck visit/unlock=15, floorplan=15,
-- email open=2 (capped at 10 per contact). Capped at 100.
CREATE OR REPLACE FUNCTION public.crm_compute_engagement_score(_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total numeric := 0;
  decay numeric;
  rec RECORD;
  open_pts numeric := 0;
  pts numeric;
BEGIN
  -- views
  FOR rec IN
    SELECT viewed_at AS at FROM crm_lead_behavior_views WHERE contact_id = _contact_id
  LOOP
    decay := power(0.5, EXTRACT(EPOCH FROM (now() - rec.at)) / (14*86400.0));
    total := total + 1 * decay;
  END LOOP;
  -- sessions
  FOR rec IN
    SELECT started_at AS at FROM crm_lead_behavior_sessions WHERE contact_id = _contact_id
  LOOP
    decay := power(0.5, EXTRACT(EPOCH FROM (now() - rec.at)) / (14*86400.0));
    total := total + 3 * decay;
  END LOOP;
  -- forms
  FOR rec IN
    SELECT submitted_at AS at FROM crm_lead_behavior_forms WHERE contact_id = _contact_id
  LOOP
    decay := power(0.5, EXTRACT(EPOCH FROM (now() - rec.at)) / (14*86400.0));
    total := total + 10 * decay;
  END LOOP;
  -- engagement events (deck visit/unlock, floorplan_download, email opens)
  FOR rec IN
    SELECT type, occurred_at AS at FROM crm_activity_events WHERE contact_id = _contact_id
  LOOP
    decay := power(0.5, EXTRACT(EPOCH FROM (now() - rec.at)) / (14*86400.0));
    pts := 0;
    IF rec.type IN ('floorplan_download') THEN pts := 15;
    ELSIF rec.type IN ('deck_visit','deck_unlock') THEN pts := 15;
    ELSIF rec.type IN ('email_open','email_opened','email.opened') THEN
      IF open_pts < 10 THEN
        pts := LEAST(2, 10 - open_pts);
        open_pts := open_pts + pts;
      ELSE pts := 0; END IF;
    END IF;
    total := total + pts * decay;
  END LOOP;
  RETURN LEAST(100, GREATEST(0, ROUND(total)::int));
END;
$$;

-- ── Quiet hours check ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_within_quiet_hours(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s smallint; e smallint; tz text; h int;
BEGIN
  SELECT quiet_hours_start, quiet_hours_end, COALESCE(quiet_hours_tz,'America/Vancouver')
    INTO s, e, tz
  FROM crm_team WHERE user_id = _user_id LIMIT 1;
  IF s IS NULL OR e IS NULL THEN RETURN false; END IF;
  h := EXTRACT(HOUR FROM (now() AT TIME ZONE tz));
  IF s = e THEN RETURN false; END IF;
  IF s < e THEN RETURN h >= s AND h < e; END IF;
  -- crosses midnight (e.g. 22..7)
  RETURN h >= s OR h < e;
END;
$$;

-- ── Send notification (dedupe + tiering) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_send_notification(
  _user_ids uuid[],
  _title text,
  _body text,
  _type text,
  _link_to text,
  _severity text DEFAULT 'low',
  _dedupe_key text DEFAULT NULL,
  _dedupe_window_minutes int DEFAULT 120,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  inserted int := 0;
  exists_recent boolean;
  effective_sev text;
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids,1) IS NULL THEN RETURN 0; END IF;
  FOREACH uid IN ARRAY _user_ids LOOP
    IF _dedupe_key IS NOT NULL THEN
      -- ttl table check
      DELETE FROM crm_notification_dedupe WHERE expires_at < now();
      SELECT EXISTS(
        SELECT 1 FROM crm_notification_dedupe
        WHERE user_id = uid AND dedupe_key = _dedupe_key AND expires_at > now()
      ) INTO exists_recent;
      IF exists_recent THEN CONTINUE; END IF;
    END IF;
    -- soften severity if in quiet hours
    effective_sev := _severity;
    IF effective_sev IN ('med','high') AND crm_within_quiet_hours(uid) THEN
      effective_sev := 'low';
    END IF;
    INSERT INTO crm_notifications(user_id, title, body, type, link_to, is_read, dedupe_key, severity, meta)
    VALUES (uid, _title, _body, _type, _link_to, false, _dedupe_key, effective_sev, COALESCE(_meta,'{}'::jsonb));
    IF _dedupe_key IS NOT NULL THEN
      INSERT INTO crm_notification_dedupe(user_id, dedupe_key, expires_at)
      VALUES (uid, _dedupe_key, now() + make_interval(mins => _dedupe_window_minutes))
      ON CONFLICT (user_id, dedupe_key) DO UPDATE SET expires_at = EXCLUDED.expires_at;
    END IF;
    inserted := inserted + 1;
  END LOOP;
  RETURN inserted;
END;
$$;

-- ── Replay recent activity into a single catch-up notification ───────────
CREATE OR REPLACE FUNCTION public.crm_replay_recent_activity(_contact_id uuid, _hours int DEFAULT 24)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt int;
  c RECORD;
  recipients uuid[];
  body_text text;
  full_name text;
BEGIN
  SELECT id, first_name, last_name, assigned_to
    INTO c FROM crm_contacts WHERE id = _contact_id LIMIT 1;
  IF c.id IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO cnt FROM crm_activity_events
    WHERE contact_id = _contact_id AND occurred_at >= now() - make_interval(hours => _hours);
  IF cnt = 0 THEN RETURN 0; END IF;

  SELECT array_agg(r) INTO recipients FROM (
    SELECT unnest(crm_recipients_for_contact(COALESCE(c.assigned_to,''))) AS r
  ) s;

  full_name := NULLIF(TRIM(COALESCE(c.first_name,'')||' '||COALESCE(c.last_name,'')), '');
  body_text := COALESCE(full_name,'A returning visitor') ||' was just identified — '|| cnt ||' recent activit'|| CASE WHEN cnt=1 THEN 'y' ELSE 'ies' END ||' in the last '|| _hours ||'h.';

  RETURN crm_send_notification(
    recipients,
    '🪪 Identified: '|| COALESCE(full_name,'returning visitor'),
    body_text,
    'lead_identified',
    '/crm/leads/'|| c.id::text,
    'med',
    'identified:'|| c.id::text,
    1440,
    jsonb_build_object('contact_id', c.id, 'activity_count', cnt)
  );
END;
$$;

-- ── Warm-up digest candidates ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_warmup_digest_candidates()
RETURNS TABLE(assigned_to text, contact_id uuid, full_name text, engagement_score int, last_activity_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.assigned_to,
         c.id,
         NULLIF(TRIM(COALESCE(c.first_name,'')||' '||COALESCE(c.last_name,'')), '') AS full_name,
         c.engagement_score,
         c.last_activity_at
    FROM crm_contacts c
   WHERE c.last_activity_at >= now() - interval '24 hours'
     AND c.engagement_score >= 15
     AND NOT EXISTS (
       SELECT 1 FROM crm_notifications n
        WHERE n.created_at >= now() - interval '24 hours'
          AND n.link_to = '/crm/leads/'|| c.id::text
          AND n.severity IN ('med','high','urgent')
     )
   ORDER BY c.engagement_score DESC, c.last_activity_at DESC;
$$;
