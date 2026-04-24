-- Embed URLs into behavior-generated note bodies so they render as clickable links in the timeline.

CREATE OR REPLACE FUNCTION public.trg_behavior_view_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prefix text;
  body_text text;
BEGIN
  prefix := CASE WHEN NEW.action = 'favorite' THEN '❤️ Favorited ' ELSE '👁 Viewed ' END;
  body_text := prefix || COALESCE(NEW.property_name, NEW.property_id, 'a property');
  IF NEW.property_url IS NOT NULL AND length(btrim(NEW.property_url)) > 0 THEN
    body_text := body_text || ' — ' || NEW.property_url;
  END IF;
  PERFORM public.write_behavior_note(NEW.contact_id, 'presale_view', body_text, NEW.viewed_at);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_behavior_session_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE body_text text;
BEGIN
  IF COALESCE(NEW.pages_viewed, 0) >= 2 OR COALESCE(NEW.duration_seconds, 0) >= 30 THEN
    body_text := '🌐 Visited site — ' || COALESCE(NEW.pages_viewed::text, '?') || ' pages'
      || COALESCE(' · ' || NEW.utm_source, '')
      || COALESCE(' · ' || (NEW.duration_seconds / 60)::text || 'm', '');
    IF NEW.landing_page IS NOT NULL AND length(btrim(NEW.landing_page)) > 0 THEN
      body_text := body_text || E'\nLanded on: ' || NEW.landing_page;
    END IF;
    IF NEW.exit_page IS NOT NULL AND length(btrim(NEW.exit_page)) > 0
       AND NEW.exit_page IS DISTINCT FROM NEW.landing_page THEN
      body_text := body_text || E'\nExited on: ' || NEW.exit_page;
    END IF;
    IF NEW.referrer IS NOT NULL AND length(btrim(NEW.referrer)) > 0 THEN
      body_text := body_text || E'\nReferrer: ' || NEW.referrer;
    END IF;
    PERFORM public.write_behavior_note(NEW.contact_id, 'presale_session', body_text, NEW.started_at);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_behavior_form_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  label text;
  body_text text;
  page_url text;
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

  body_text := label
    || COALESCE(' — ' || NEW.form_name, '')
    || COALESCE(' (' || NEW.property_name || ')', '');

  -- Pull URL from common payload keys if present
  IF NEW.payload IS NOT NULL THEN
    page_url := COALESCE(
      NEW.payload->>'page_url',
      NEW.payload->>'url',
      NEW.payload->>'source_url',
      NEW.payload->>'referrer'
    );
    IF page_url IS NOT NULL AND length(btrim(page_url)) > 0 THEN
      body_text := body_text || E'\nPage: ' || page_url;
    END IF;
  END IF;

  PERFORM public.write_behavior_note(NEW.contact_id, 'presale_form', body_text, NEW.submitted_at);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_behavior_engagement_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  label text;
  body_text text;
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

  body_text := label || COALESCE(' — ' || NEW.campaign_name, '');
  IF NEW.link_url IS NOT NULL AND length(btrim(NEW.link_url)) > 0 THEN
    body_text := body_text || E'\nLink: ' || NEW.link_url;
  END IF;

  PERFORM public.write_behavior_note(NEW.contact_id, 'presale_engagement', body_text, NEW.occurred_at);
  RETURN NEW;
END;
$function$;