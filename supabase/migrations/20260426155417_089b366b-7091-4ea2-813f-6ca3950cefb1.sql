-- ------------------------------------------------------------------
-- 1) Refresh recalc_lead_score() to include unified messaging activity
--    (SMS + WhatsApp via crm_messages) and to factor message timestamps
--    into the "last activity" recency bonus.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_lead_score(_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  outbound_emails int := 0;
  inbound_emails int := 0;
  active_notes int := 0;
  showings_count int := 0;
  outbound_msgs int := 0;
  inbound_msgs int := 0;
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

  -- NEW: SMS / WhatsApp activity from the unified messages table.
  SELECT
    COUNT(*) FILTER (WHERE direction = 'outbound'),
    COUNT(*) FILTER (WHERE direction = 'inbound')
  INTO outbound_msgs, inbound_msgs
  FROM public.crm_messages
  WHERE contact_id = _contact_id;

  -- Last activity = max of email sent_at, note event_at, showing date,
  -- AND message created_at (so a fresh text bumps recency too).
  SELECT GREATEST(
    COALESCE(last_activity, 'epoch'::timestamptz),
    COALESCE((SELECT MAX(COALESCE(event_at, created_at)) FROM public.crm_notes WHERE contact_id = _contact_id AND note_type NOT IN ('import_archive')), 'epoch'::timestamptz),
    COALESCE((SELECT MAX((showing_date::timestamp)::timestamptz) FROM public.crm_showings WHERE contact_id = _contact_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.crm_messages WHERE contact_id = _contact_id), 'epoch'::timestamptz)
  ) INTO last_activity;

  -- Same weighting style as emails: inbound replies count more than outbound.
  -- Caps prevent any single channel from dominating the score.
  score := LEAST(outbound_emails * 5, 25)
         + LEAST(inbound_emails * 10, 40)
         + LEAST(active_notes * 4, 20)
         + LEAST(showings_count * 15, 30)
         + LEAST(outbound_msgs * 3, 15)
         + LEAST(inbound_msgs * 8, 30);

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
$function$;

-- ------------------------------------------------------------------
-- 2) Trigger on crm_messages → recompute the contact's score on
--    every send / receive (mirrors the email/note/showing triggers).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recalc_lead_score_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.contact_id IS NOT NULL THEN
      PERFORM public.recalc_lead_score(OLD.contact_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.contact_id IS NOT NULL THEN
      PERFORM public.recalc_lead_score(NEW.contact_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lead_score_message ON public.crm_messages;
CREATE TRIGGER trg_lead_score_message
AFTER INSERT OR UPDATE OR DELETE ON public.crm_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_lead_score_message();

-- ------------------------------------------------------------------
-- 3) Bulk recompute helper — called by the Leads page on open so the
--    recency bonus is fresh even for leads with no recent events.
--    Limited to active CRM members; safe for any agent to call.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_all_lead_scores()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  cnt int := 0;
BEGIN
  -- Only CRM members may invoke (matches our other CRM RPCs).
  IF NOT public.is_crm_member(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR rec IN SELECT id FROM public.crm_contacts LOOP
    PERFORM public.recalc_lead_score(rec.id);
    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalc_all_lead_scores() TO authenticated;