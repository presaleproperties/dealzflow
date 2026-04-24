
-- Notify CRM team when a contact returns to the site after a gap.
-- Threshold: the prior session's end_at (or started_at if no end) was >= 30 minutes ago.
CREATE OR REPLACE FUNCTION public.trg_behavior_session_return_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_at TIMESTAMPTZ;
  v_gap_minutes INTEGER;
  v_contact RECORD;
  v_first_name TEXT;
  v_last_name TEXT;
  v_full_name TEXT;
  v_landing TEXT;
  v_body TEXT;
  v_link TEXT;
BEGIN
  -- Only act on contact-linked sessions
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the most recent prior session for this contact
  SELECT COALESCE(ended_at, started_at) INTO v_prev_at
  FROM public.crm_lead_behavior_sessions
  WHERE contact_id = NEW.contact_id
    AND id <> NEW.id
  ORDER BY started_at DESC
  LIMIT 1;

  -- First-ever session: skip (this is "new lead", not "return visit")
  IF v_prev_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_gap_minutes := EXTRACT(EPOCH FROM (NEW.started_at - v_prev_at)) / 60;

  -- Threshold: only notify if gap >= 30 minutes
  IF v_gap_minutes < 30 THEN
    RETURN NEW;
  END IF;

  -- Resolve contact name
  SELECT first_name, last_name INTO v_first_name, v_last_name
  FROM public.crm_contacts
  WHERE id = NEW.contact_id;

  v_full_name := NULLIF(TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, '')), '');
  IF v_full_name IS NULL THEN v_full_name := 'A lead'; END IF;

  v_landing := COALESCE(NEW.landing_page, NEW.exit_page, 'the site');
  v_link := '/crm/leads/' || NEW.contact_id::text;

  v_body := v_full_name || ' is back on presaleproperties.com — viewing ' || v_landing
            || ' (last visit ' ||
            CASE
              WHEN v_gap_minutes < 60 THEN v_gap_minutes::text || 'm ago'
              WHEN v_gap_minutes < 1440 THEN ROUND(v_gap_minutes / 60.0, 1)::text || 'h ago'
              ELSE ROUND(v_gap_minutes / 1440.0, 1)::text || 'd ago'
            END
            || ')';

  -- Insert one notification per active CRM team member
  INSERT INTO public.crm_notifications (user_id, title, body, type, link_to)
  SELECT
    t.user_id,
    v_full_name || ' returned to the site',
    v_body,
    'lead_return_visit',
    v_link
  FROM public.crm_team t
  WHERE t.is_active = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_behavior_session_return_notify ON public.crm_lead_behavior_sessions;
CREATE TRIGGER trg_behavior_session_return_notify
AFTER INSERT ON public.crm_lead_behavior_sessions
FOR EACH ROW
EXECUTE FUNCTION public.trg_behavior_session_return_notify();
