
CREATE OR REPLACE FUNCTION public.zara_mark_draft_replied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.zara_suggested_replies
       SET replied_at = COALESCE(replied_at, NEW.created_at),
           outcome = CASE WHEN outcome IS NULL OR outcome = 'none'
                          THEN 'replied' ELSE outcome END
     WHERE contact_id = NEW.contact_id
       AND sent_at IS NOT NULL
       AND sent_at > now() - interval '14 days'
       AND replied_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zara_mark_replied ON public.crm_messages;
CREATE TRIGGER trg_zara_mark_replied
AFTER INSERT ON public.crm_messages
FOR EACH ROW EXECUTE FUNCTION public.zara_mark_draft_replied();

CREATE OR REPLACE FUNCTION public.zara_mark_draft_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.zara_suggested_replies
       SET booked_at = COALESCE(booked_at, now()),
           outcome = 'booked'
     WHERE contact_id = NEW.contact_id
       AND sent_at IS NOT NULL
       AND sent_at > now() - interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zara_mark_booked ON public.crm_showings;
CREATE TRIGGER trg_zara_mark_booked
AFTER INSERT ON public.crm_showings
FOR EACH ROW EXECUTE FUNCTION public.zara_mark_draft_booked();
