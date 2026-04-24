-- Backfill: regenerate note content for existing crm_lead_behavior_* rows
CREATE OR REPLACE FUNCTION public.backfill_behavior_notes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_views int := 0;
  v_sessions int := 0;
  v_forms int := 0;
  v_eng int := 0;
  r record;
  body_text text;
  label text;
  page_url text;
  prefix text;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can run the behavior backfill';
  END IF;

  -- VIEWS
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_views WHERE contact_id IS NOT NULL
  LOOP
    prefix := CASE WHEN r.action = 'favorite' THEN '❤️ Favorited ' ELSE '👁 Viewed ' END;
    body_text := prefix || COALESCE(r.property_name, r.property_id, 'a property');
    IF r.property_url IS NOT NULL AND length(btrim(r.property_url)) > 0 THEN
      body_text := body_text || ' — ' || r.property_url;
    END IF;
    UPDATE public.crm_notes
       SET content = body_text, updated_at = now()
     WHERE contact_id = r.contact_id
       AND note_type = 'presale_view'
       AND event_at = r.viewed_at;
    IF FOUND THEN v_views := v_views + 1;
    ELSE
      PERFORM public.write_behavior_note(r.contact_id, 'presale_view', body_text, r.viewed_at);
      v_views := v_views + 1;
    END IF;
  END LOOP;

  -- SESSIONS
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_sessions
     WHERE contact_id IS NOT NULL
       AND (COALESCE(pages_viewed,0) >= 2 OR COALESCE(duration_seconds,0) >= 30)
  LOOP
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
    UPDATE public.crm_notes
       SET content = body_text, updated_at = now()
     WHERE contact_id = r.contact_id
       AND note_type = 'presale_session'
       AND event_at = r.started_at;
    IF FOUND THEN v_sessions := v_sessions + 1;
    ELSE
      PERFORM public.write_behavior_note(r.contact_id, 'presale_session', body_text, r.started_at);
      v_sessions := v_sessions + 1;
    END IF;
  END LOOP;

  -- FORMS
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_forms WHERE contact_id IS NOT NULL
  LOOP
    label := CASE r.form_type
      WHEN 'signup_started' THEN '🚀 Started signup'
      WHEN 'signup_step_1' THEN '✏️ Signup step 1'
      WHEN 'signup_step_2' THEN '✏️ Signup step 2'
      WHEN 'signup_step_3' THEN '✏️ Signup step 3'
      WHEN 'signup_completed' THEN '✅ Completed signup'
      WHEN 'signup_abandoned' THEN '⏸ Abandoned signup'
      WHEN 'brochure_download' THEN '📥 Downloaded brochure'
      WHEN 'floor_plan' THEN '📐 Requested floor plan'
      WHEN 'tour_request' THEN '🏠 Requested tour'
      WHEN 'newsletter' THEN '📰 Subscribed to newsletter'
      WHEN 'contact' THEN '✉️ Submitted contact form'
      ELSE '📝 ' || replace(r.form_type, '_', ' ')
    END;
    body_text := label
      || COALESCE(' — ' || r.form_name, '')
      || COALESCE(' (' || r.property_name || ')', '');
    IF r.payload IS NOT NULL THEN
      page_url := COALESCE(
        r.payload->>'page_url',
        r.payload->>'url',
        r.payload->>'source_url',
        r.payload->>'referrer'
      );
      IF page_url IS NOT NULL AND length(btrim(page_url)) > 0 THEN
        body_text := body_text || E'\nPage: ' || page_url;
      END IF;
    END IF;
    UPDATE public.crm_notes
       SET content = body_text, updated_at = now()
     WHERE contact_id = r.contact_id
       AND note_type = 'presale_form'
       AND event_at = r.submitted_at;
    IF FOUND THEN v_forms := v_forms + 1;
    ELSE
      PERFORM public.write_behavior_note(r.contact_id, 'presale_form', body_text, r.submitted_at);
      v_forms := v_forms + 1;
    END IF;
  END LOOP;

  -- ENGAGEMENT
  FOR r IN
    SELECT * FROM public.crm_lead_behavior_engagement WHERE contact_id IS NOT NULL
  LOOP
    label := CASE r.event_type
      WHEN 'email_open' THEN '📧 Opened email'
      WHEN 'email_click' THEN '🔗 Clicked link in email'
      WHEN 'email_unsubscribe' THEN '🚫 Unsubscribed'
      WHEN 'email_bounce' THEN '⚠️ Email bounced'
      WHEN 'template_view' THEN '👁 Viewed template'
      WHEN 'page_click' THEN '🔗 Clicked'
      WHEN 'button_click' THEN '🔘 Clicked button'
      ELSE '⚡ ' || replace(r.event_type, '_', ' ')
    END;
    body_text := label || COALESCE(' — ' || r.campaign_name, '');
    IF r.link_url IS NOT NULL AND length(btrim(r.link_url)) > 0 THEN
      body_text := body_text || E'\nLink: ' || r.link_url;
    END IF;
    UPDATE public.crm_notes
       SET content = body_text, updated_at = now()
     WHERE contact_id = r.contact_id
       AND note_type = 'presale_engagement'
       AND event_at = r.occurred_at;
    IF FOUND THEN v_eng := v_eng + 1;
    ELSE
      PERFORM public.write_behavior_note(r.contact_id, 'presale_engagement', body_text, r.occurred_at);
      v_eng := v_eng + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'views', v_views,
    'sessions', v_sessions,
    'forms', v_forms,
    'engagement', v_eng,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_behavior_notes() TO authenticated;