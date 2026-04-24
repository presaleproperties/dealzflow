-- Helper: insert a notification row, optionally fanned out to multiple users
CREATE OR REPLACE FUNCTION public.notify_crm(_user_ids uuid[], _title text, _body text, _type text, _link_to text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN RETURN; END IF;
  FOREACH u IN ARRAY _user_ids LOOP
    INSERT INTO public.crm_notifications (user_id, title, body, type, link_to, is_read, created_at)
    VALUES (u, _title, _body, _type, _link_to, false, now());
  END LOOP;
END;
$$;

-- Resolve recipients for a contact: prefer assigned agent (matched by display_name), else all active CRM members
CREATE OR REPLACE FUNCTION public.crm_recipients_for_contact(_assigned_to text)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _assigned_to IS NOT NULL AND _assigned_to <> '' THEN
      COALESCE(
        (SELECT array_agg(user_id) FROM public.crm_team
          WHERE is_active = true AND lower(display_name) = lower(_assigned_to)),
        (SELECT array_agg(user_id) FROM public.crm_team WHERE is_active = true)
      )
    ELSE
      (SELECT array_agg(user_id) FROM public.crm_team WHERE is_active = true)
  END;
$$;

-- Trigger: new lead notification
CREATE OR REPLACE FUNCTION public.trg_notify_new_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipients uuid[];
BEGIN
  recipients := public.crm_recipients_for_contact(NEW.assigned_to);
  PERFORM public.notify_crm(
    recipients,
    'New lead: ' || NEW.first_name || ' ' || NEW.last_name,
    COALESCE('Source: ' || NEW.source, 'New lead added to CRM'),
    'lead_new',
    '/crm/leads/' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_new_lead_notify ON public.crm_contacts;
CREATE TRIGGER trg_crm_new_lead_notify
AFTER INSERT ON public.crm_contacts
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_lead();

-- Trigger: stage change notification
CREATE OR REPLACE FUNCTION public.trg_notify_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipients uuid[];
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    recipients := public.crm_recipients_for_contact(NEW.assigned_to);
    PERFORM public.notify_crm(
      recipients,
      NEW.first_name || ' ' || NEW.last_name || ' → ' || COALESCE(NEW.status, 'No status'),
      'Moved from ' || COALESCE(OLD.status, '—') || ' to ' || COALESCE(NEW.status, '—'),
      'stage_change',
      '/crm/leads/' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_stage_change_notify ON public.crm_contacts;
CREATE TRIGGER trg_crm_stage_change_notify
AFTER UPDATE OF status ON public.crm_contacts
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_stage_change();

-- Overdue follow-ups: callable function (idempotent for the day per contact)
CREATE OR REPLACE FUNCTION public.notify_overdue_followups()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  recipients uuid[];
  inserted int := 0;
BEGIN
  FOR r IN
    SELECT id, first_name, last_name, assigned_to, next_followup_date, status
    FROM public.crm_contacts
    WHERE next_followup_date IS NOT NULL
      AND next_followup_date::date < CURRENT_DATE
      AND COALESCE(status, '') NOT IN ('Closed Won', 'Closed Lost', 'Past Client', 'Nurture')
  LOOP
    recipients := public.crm_recipients_for_contact(r.assigned_to);
    -- Skip if a followup_overdue notification already exists today for this lead+user
    IF recipients IS NOT NULL THEN
      INSERT INTO public.crm_notifications (user_id, title, body, type, link_to, is_read, created_at)
      SELECT u, 'Overdue follow-up: ' || r.first_name || ' ' || r.last_name,
             'Follow-up was due ' || to_char(r.next_followup_date::date, 'Mon DD'),
             'followup_overdue',
             '/crm/leads/' || r.id::text,
             false, now()
      FROM unnest(recipients) AS u
      WHERE NOT EXISTS (
        SELECT 1 FROM public.crm_notifications n
        WHERE n.user_id = u
          AND n.type = 'followup_overdue'
          AND n.link_to = '/crm/leads/' || r.id::text
          AND n.created_at::date = CURRENT_DATE
      );
      GET DIAGNOSTICS inserted = ROW_COUNT;
    END IF;
  END LOOP;
  RETURN inserted;
END;
$$;

-- RLS: ensure CRM members can read their own notifications & mark them read
ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.crm_notifications;
CREATE POLICY "Users read own notifications"
ON public.crm_notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.crm_notifications;
CREATE POLICY "Users update own notifications"
ON public.crm_notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.crm_notifications;
CREATE POLICY "Users delete own notifications"
ON public.crm_notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);