
-- Backfill behavior notes for any contacts whose behavior rows were migrated
-- via UPDATE (which doesn't fire AFTER INSERT triggers), so notes never got
-- created. Re-runs the same write_behavior_note() the triggers use, which is
-- already idempotent (skips if matching content exists within ±2 min).

CREATE OR REPLACE FUNCTION public.backfill_behavior_notes_for_contact(_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  n_written integer := 0;
  body_text text;
  label text;
  page_url text;
  cta text;
BEGIN
  -- Forms
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_forms
    WHERE contact_id = _contact_id ORDER BY submitted_at
  LOOP
    label := CASE r.form_type
      WHEN 'signup_started'   THEN '🚀 Started signup'
      WHEN 'signup_completed' THEN '✅ Completed signup'
      WHEN 'signup_abandoned' THEN '⏸ Abandoned signup'
      WHEN 'brochure_download' THEN '📥 Downloaded brochure'
      WHEN 'floor_plan'        THEN '📐 Requested floor plan'
      WHEN 'floor_plan_request' THEN '📐 Requested floor plan'
      WHEN 'project_inquiry'   THEN '📨 Project inquiry'
      WHEN 'tour_request'      THEN '🏠 Requested tour'
      WHEN 'newsletter'        THEN '📰 Subscribed to newsletter'
      WHEN 'contact'           THEN '✉️ Submitted contact form'
      ELSE '📝 ' || replace(r.form_type, '_', ' ')
    END;
    body_text := label
      || COALESCE(' — ' || r.form_name, '')
      || COALESCE(' (' || r.property_name || ')', '');
    IF r.payload IS NOT NULL THEN
      page_url := COALESCE(
        r.payload->>'page_url', r.payload->>'url',
        r.payload->>'source_url', r.payload->>'referrer'
      );
      IF page_url IS NOT NULL AND length(btrim(page_url)) > 0 THEN
        body_text := body_text || E'\nPage: ' || page_url;
      END IF;
    END IF;
    PERFORM public.write_behavior_note(_contact_id, 'presale_form', body_text, r.submitted_at);
    n_written := n_written + 1;
  END LOOP;

  -- Views
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_views
    WHERE contact_id = _contact_id ORDER BY viewed_at
  LOOP
    body_text := (CASE WHEN r.action = 'favorite' THEN '❤️ Favorited ' ELSE '👁 Viewed ' END)
      || COALESCE(r.property_name, r.property_id, 'a property');
    IF r.property_url IS NOT NULL AND length(btrim(r.property_url)) > 0 THEN
      body_text := body_text || ' — ' || r.property_url;
    END IF;
    PERFORM public.write_behavior_note(_contact_id, 'presale_view', body_text, r.viewed_at);
    n_written := n_written + 1;
  END LOOP;

  -- Sessions
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_sessions
    WHERE contact_id = _contact_id ORDER BY started_at
  LOOP
    IF COALESCE(r.pages_viewed, 0) >= 2 OR COALESCE(r.duration_seconds, 0) >= 30 THEN
      body_text := '🌐 Visited site — ' || COALESCE(r.pages_viewed::text, '?') || ' pages'
        || COALESCE(' · ' || r.utm_source, '')
        || COALESCE(' · ' || (r.duration_seconds / 60)::text || 'm', '');
      IF r.landing_page IS NOT NULL AND length(btrim(r.landing_page)) > 0 THEN
        body_text := body_text || E'\nLanded on: ' || r.landing_page;
      END IF;
      IF r.exit_page IS NOT NULL AND length(btrim(r.exit_page)) > 0
         AND r.exit_page IS DISTINCT FROM r.landing_page THEN
        body_text := body_text || E'\nExited on: ' || r.exit_page;
      END IF;
      IF r.referrer IS NOT NULL AND length(btrim(r.referrer)) > 0 THEN
        body_text := body_text || E'\nReferrer: ' || r.referrer;
      END IF;
      PERFORM public.write_behavior_note(_contact_id, 'presale_session', body_text, r.started_at);
      n_written := n_written + 1;
    END IF;
  END LOOP;

  -- Engagement
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_engagement
    WHERE contact_id = _contact_id ORDER BY occurred_at
  LOOP
    IF r.event_type = 'email_click' OR r.event_type = 'page_click' OR r.event_type = 'button_click' THEN
      cta := public.crm_cta_label(r.metadata->>'button', r.link_url);
      label := '🔗 Clicked ' || cta;
    ELSE
      label := CASE r.event_type
        WHEN 'email_open' THEN '📧 Opened email'
        WHEN 'email_unsubscribe' THEN '🚫 Unsubscribed'
        WHEN 'email_bounce' THEN '⚠️ Email bounced'
        ELSE '⚡ ' || replace(r.event_type, '_', ' ')
      END;
    END IF;
    body_text := label || COALESCE(' — ' || r.campaign_name, '');
    PERFORM public.write_behavior_note(_contact_id, 'presale_engagement', body_text, r.occurred_at);
    n_written := n_written + 1;
  END LOOP;

  RETURN n_written;
END;
$$;

-- Run for the affected lead now
SELECT public.backfill_behavior_notes_for_contact('3a0f1583-e5b5-40b8-a5ff-68e8bd39957b'::uuid);

-- And for any other contact missing notes despite having behavior rows
DO $$
DECLARE c uuid;
BEGIN
  FOR c IN
    SELECT DISTINCT contact_id FROM (
      SELECT contact_id FROM public.crm_lead_behavior_forms
      UNION SELECT contact_id FROM public.crm_lead_behavior_views
      UNION SELECT contact_id FROM public.crm_lead_behavior_sessions
      UNION SELECT contact_id FROM public.crm_lead_behavior_engagement
    ) s
    WHERE contact_id IS NOT NULL
  LOOP
    PERFORM public.backfill_behavior_notes_for_contact(c);
  END LOOP;
END $$;
