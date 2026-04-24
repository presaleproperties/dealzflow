-- Helper to write a system note onto the lead timeline for behavior events
CREATE OR REPLACE FUNCTION public.write_behavior_note(_contact_id uuid, _kind text, _body text, _event_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _contact_id IS NULL OR _body IS NULL OR length(btrim(_body)) = 0 THEN RETURN; END IF;
  INSERT INTO public.crm_notes (contact_id, user_id, content, note_type, event_at, is_pinned, created_at)
  SELECT _contact_id,
         (SELECT user_id FROM public.crm_team WHERE is_active = true ORDER BY created_at LIMIT 1),
         _body, _kind, COALESCE(_event_at, now()), false, now();
END;
$$;

-- Trigger fns: on insert into each behavior table, append a note
CREATE OR REPLACE FUNCTION public.trg_behavior_view_note()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_behavior_note(
    NEW.contact_id,
    'presale_view',
    CASE WHEN NEW.action = 'favorite' THEN '❤️ Favorited ' ELSE '👁 Viewed ' END
      || COALESCE(NEW.property_name, NEW.property_id, 'a property')
      || COALESCE(' on Presale Properties', ''),
    NEW.viewed_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_behavior_engagement_note()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text;
BEGIN
  label := CASE NEW.event_type
    WHEN 'email_open' THEN '📧 Opened email'
    WHEN 'email_click' THEN '🔗 Clicked link in email'
    WHEN 'email_unsubscribe' THEN '🚫 Unsubscribed'
    WHEN 'email_bounce' THEN '⚠️ Email bounced'
    WHEN 'template_view' THEN '👁 Viewed template'
    WHEN 'page_click' THEN '🔗 Clicked'
    WHEN 'button_click' THEN '🔘 Clicked button'
    ELSE '⚡ ' || replace(NEW.event_type, '_', ' ')
  END;
  PERFORM public.write_behavior_note(
    NEW.contact_id, 'presale_engagement',
    label || COALESCE(' — ' || NEW.campaign_name, '') || COALESCE(' (' || NEW.link_url || ')', ''),
    NEW.occurred_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_behavior_form_note()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text;
BEGIN
  label := CASE NEW.form_type
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
    ELSE '📝 ' || replace(NEW.form_type, '_', ' ')
  END;
  PERFORM public.write_behavior_note(
    NEW.contact_id, 'presale_form',
    label || COALESCE(' — ' || NEW.form_name, '') || COALESCE(' (' || NEW.property_name || ')', ''),
    NEW.submitted_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_behavior_session_note()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- only emit for substantial sessions to avoid noise
  IF COALESCE(NEW.pages_viewed, 0) >= 2 OR COALESCE(NEW.duration_seconds, 0) >= 30 THEN
    PERFORM public.write_behavior_note(
      NEW.contact_id, 'presale_session',
      '🌐 Visited site — ' || COALESCE(NEW.pages_viewed::text, '?') || ' pages'
        || COALESCE(' · ' || NEW.utm_source, '')
        || COALESCE(' · ' || (NEW.duration_seconds / 60)::text || 'm', ''),
      NEW.started_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_behavior_view_note AFTER INSERT ON public.crm_lead_behavior_views FOR EACH ROW EXECUTE FUNCTION public.trg_behavior_view_note();
CREATE TRIGGER trg_behavior_engagement_note AFTER INSERT ON public.crm_lead_behavior_engagement FOR EACH ROW EXECUTE FUNCTION public.trg_behavior_engagement_note();
CREATE TRIGGER trg_behavior_form_note AFTER INSERT ON public.crm_lead_behavior_forms FOR EACH ROW EXECUTE FUNCTION public.trg_behavior_form_note();
CREATE TRIGGER trg_behavior_session_note AFTER INSERT ON public.crm_lead_behavior_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_behavior_session_note();