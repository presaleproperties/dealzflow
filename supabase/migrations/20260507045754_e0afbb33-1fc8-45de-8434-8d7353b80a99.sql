-- 1) Helper: turn a (button_key, url) into a friendly CTA label
CREATE OR REPLACE FUNCTION public.crm_cta_label(button_key text, url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text := lower(coalesce(button_key, ''));
  u text := lower(coalesce(url, ''));
BEGIN
  IF k = 'brochure' THEN RETURN 'Brochure'; END IF;
  IF k IN ('floor_plans','floorplans','floor_plan') THEN RETURN 'Floor Plans'; END IF;
  IF k IN ('pricing','price_list') THEN RETURN 'Pricing'; END IF;
  IF k IN ('project_details','view_project_details') THEN RETURN 'Project Details'; END IF;
  IF k = 'call' OR u LIKE 'tel:%' THEN RETURN 'Call Now'; END IF;

  IF u LIKE '%instagram.com%' THEN RETURN 'Instagram'; END IF;
  IF u LIKE '%facebook.com%' THEN RETURN 'Facebook'; END IF;
  IF u LIKE '%youtube.com%' OR u LIKE '%youtu.be%' THEN RETURN 'YouTube'; END IF;
  IF u LIKE '%tiktok.com%' THEN RETURN 'TikTok'; END IF;
  IF u LIKE '%linkedin.com%' THEN RETURN 'LinkedIn'; END IF;
  IF u LIKE '%.pdf' OR u LIKE '%/brochures/%' THEN RETURN 'Brochure'; END IF;
  IF u LIKE '%floor%' OR u LIKE '%floorplan%' THEN RETURN 'Floor Plans'; END IF;
  IF u LIKE '%pricing%' OR u LIKE '%price-list%' THEN RETURN 'Pricing'; END IF;
  IF u LIKE '%presaleproperties.com/projects/%' THEN RETURN 'Project Details'; END IF;
  IF u LIKE 'mailto:%' THEN RETURN 'Email'; END IF;
  RETURN 'Link';
END;
$$;

-- 2) Replace engagement trigger to use friendly CTA labels and drop raw URLs
CREATE OR REPLACE FUNCTION public.trg_behavior_engagement_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  label text;
  body_text text;
  cta text;
BEGIN
  IF NEW.event_type = 'email_click' THEN
    cta := public.crm_cta_label(NEW.metadata->>'button', NEW.link_url);
    label := '🔗 Clicked ' || cta;
  ELSIF NEW.event_type = 'page_click' OR NEW.event_type = 'button_click' THEN
    cta := public.crm_cta_label(NEW.metadata->>'button', NEW.link_url);
    label := '🔗 Clicked ' || cta;
  ELSE
    label := CASE NEW.event_type
      WHEN 'email_open' THEN '📧 Opened email'
      WHEN 'email_unsubscribe' THEN '🚫 Unsubscribed'
      WHEN 'email_bounce' THEN '⚠️ Email bounced'
      WHEN 'template_view' THEN '👁 Viewed template'
      ELSE '⚡ ' || replace(NEW.event_type, '_', ' ')
    END;
  END IF;

  body_text := label || COALESCE(' — ' || NEW.campaign_name, '');
  -- Intentionally do NOT append the raw link_url; the CTA label carries the meaning.

  PERFORM public.write_behavior_note(NEW.contact_id, 'presale_engagement', body_text, NEW.occurred_at);
  RETURN NEW;
END;
$$;

-- 3) Rewrite existing click notes in place so the timeline updates immediately.
WITH click_notes AS (
  SELECT n.id AS note_id,
         e.id AS eng_id,
         public.crm_cta_label(e.metadata->>'button', e.link_url) AS cta,
         e.campaign_name
  FROM public.crm_notes n
  JOIN public.crm_lead_behavior_engagement e
    ON e.contact_id = n.contact_id
   AND e.occurred_at = n.event_at
   AND e.event_type IN ('email_click','page_click','button_click')
  WHERE n.note_type = 'presale_engagement'
    AND (n.content LIKE '%Clicked link%' OR n.content LIKE '%Link:%')
)
UPDATE public.crm_notes n
SET content = '🔗 Clicked ' || c.cta || COALESCE(' — ' || c.campaign_name, ''),
    updated_at = now()
FROM click_notes c
WHERE n.id = c.note_id;

-- 4) Strip "Link: ..." tail from any remaining engagement notes
UPDATE public.crm_notes
SET content = regexp_replace(content, E'\\nLink:.*$', '', 'g'),
    updated_at = now()
WHERE note_type = 'presale_engagement'
  AND content LIKE '%' || E'\nLink:' || '%';