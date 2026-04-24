-- Lead scoring function
CREATE OR REPLACE FUNCTION public.recalc_lead_score(_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  outbound_emails int := 0;
  inbound_emails int := 0;
  active_notes int := 0;
  showings_count int := 0;
  last_activity timestamptz;
  score int := 0;
  recency_bonus int := 0;
BEGIN
  IF _contact_id IS NULL THEN RETURN; END IF;

  SELECT
    COUNT(*) FILTER (WHERE direction = 'outbound'),
    COUNT(*) FILTER (WHERE direction = 'inbound'),
    MAX(sent_at)
  INTO outbound_emails, inbound_emails, last_activity
  FROM public.crm_email_log
  WHERE contact_id = _contact_id;

  SELECT COUNT(*)
  INTO active_notes
  FROM public.crm_notes
  WHERE contact_id = _contact_id
    AND note_type NOT IN ('import_archive', 'system');

  SELECT COUNT(*)
  INTO showings_count
  FROM public.crm_showings
  WHERE contact_id = _contact_id;

  -- Last activity = max of email sent_at, note event_at, showing date
  SELECT GREATEST(
    COALESCE(last_activity, 'epoch'::timestamptz),
    COALESCE((SELECT MAX(COALESCE(event_at, created_at)) FROM public.crm_notes WHERE contact_id = _contact_id AND note_type NOT IN ('import_archive')), 'epoch'::timestamptz),
    COALESCE((SELECT MAX((showing_date::timestamp)::timestamptz) FROM public.crm_showings WHERE contact_id = _contact_id), 'epoch'::timestamptz)
  ) INTO last_activity;

  score := LEAST(outbound_emails * 5, 25)
         + LEAST(inbound_emails * 10, 40)
         + LEAST(active_notes * 4, 20)
         + LEAST(showings_count * 15, 30);

  IF last_activity > now() - interval '7 days' THEN
    recency_bonus := 10;
  ELSIF last_activity > now() - interval '30 days' THEN
    recency_bonus := 5;
  END IF;

  score := LEAST(score + recency_bonus, 100);

  UPDATE public.crm_contacts
  SET lead_score = score
  WHERE id = _contact_id;
END;
$$;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_lead_score(COALESCE(NEW.contact_id, OLD.contact_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_lead_score(COALESCE(NEW.contact_id, OLD.contact_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_showing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_lead_score(COALESCE(NEW.contact_id, OLD.contact_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trg_lead_score_email ON public.crm_email_log;
DROP TRIGGER IF EXISTS trg_lead_score_note ON public.crm_notes;
DROP TRIGGER IF EXISTS trg_lead_score_showing ON public.crm_showings;

CREATE TRIGGER trg_lead_score_email
AFTER INSERT OR UPDATE OR DELETE ON public.crm_email_log
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_lead_score_email();

CREATE TRIGGER trg_lead_score_note
AFTER INSERT OR UPDATE OR DELETE ON public.crm_notes
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_lead_score_note();

CREATE TRIGGER trg_lead_score_showing
AFTER INSERT OR UPDATE OR DELETE ON public.crm_showings
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_lead_score_showing();

-- Backfill scores for all existing contacts
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.crm_contacts LOOP
    PERFORM public.recalc_lead_score(r.id);
  END LOOP;
END $$;