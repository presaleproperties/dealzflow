
-- 1. Add columns
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS last_touch_type text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;

-- 2. Backfill last_touch_at from crm_email_log and crm_notes
WITH email_max AS (
  SELECT contact_id, MAX(sent_at) AS max_at FROM public.crm_email_log GROUP BY contact_id
),
note_max AS (
  SELECT contact_id, MAX(created_at) AS max_at FROM public.crm_notes GROUP BY contact_id
),
showing_max AS (
  SELECT contact_id, MAX(created_at) AS max_at FROM public.crm_showings GROUP BY contact_id
),
combined AS (
  SELECT
    c.id AS contact_id,
    GREATEST(e.max_at, n.max_at, s.max_at) AS last_at,
    CASE
      WHEN e.max_at IS NOT NULL AND (n.max_at IS NULL OR e.max_at >= n.max_at) AND (s.max_at IS NULL OR e.max_at >= s.max_at) THEN 'email_sent'
      WHEN n.max_at IS NOT NULL AND (s.max_at IS NULL OR n.max_at >= s.max_at) THEN 'note_added'
      WHEN s.max_at IS NOT NULL THEN 'showing_booked'
      ELSE NULL
    END AS touch_type
  FROM public.crm_contacts c
  LEFT JOIN email_max e ON e.contact_id = c.id
  LEFT JOIN note_max n ON n.contact_id = c.id
  LEFT JOIN showing_max s ON s.contact_id = c.id
)
UPDATE public.crm_contacts
SET last_touch_at = combined.last_at,
    last_touch_type = combined.touch_type
FROM combined
WHERE crm_contacts.id = combined.contact_id
  AND combined.last_at IS NOT NULL;

-- 3. Backfill stage_changed_at from status_changed_at where available
UPDATE public.crm_contacts
SET stage_changed_at = status_changed_at
WHERE status_changed_at IS NOT NULL;

-- 4. Trigger: update last_touch on email log insert
CREATE OR REPLACE FUNCTION public.update_last_touch_on_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_contacts
  SET last_touch_at = NEW.sent_at,
      last_touch_type = 'email_sent'
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_last_touch_email ON public.crm_email_log;
CREATE TRIGGER trg_last_touch_email
  AFTER INSERT ON public.crm_email_log
  FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_email();

-- 5. Trigger: update last_touch on note insert
CREATE OR REPLACE FUNCTION public.update_last_touch_on_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_contacts
  SET last_touch_at = NOW(),
      last_touch_type = 'note_added'
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_last_touch_note ON public.crm_notes;
CREATE TRIGGER trg_last_touch_note
  AFTER INSERT ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_note();

-- 6. Trigger: update last_touch on showing insert
CREATE OR REPLACE FUNCTION public.update_last_touch_on_showing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_contacts
  SET last_touch_at = NOW(),
      last_touch_type = 'showing_booked'
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_last_touch_showing ON public.crm_showings;
CREATE TRIGGER trg_last_touch_showing
  AFTER INSERT ON public.crm_showings
  FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_showing();

-- 7. Trigger: update last_touch on CRM message insert
CREATE OR REPLACE FUNCTION public.update_last_touch_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.crm_contacts
    SET last_touch_at = NOW(),
        last_touch_type = CASE
          WHEN NEW.channel = 'whatsapp' THEN 'whatsapp_message'
          WHEN NEW.channel = 'email' THEN 'email_sent'
          ELSE 'message'
        END
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_last_touch_message ON public.crm_messages;
CREATE TRIGGER trg_last_touch_message
  AFTER INSERT ON public.crm_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_message();

-- 8. Trigger: update stage_changed_at and last_touch on status change
CREATE OR REPLACE FUNCTION public.update_stage_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.stage_changed_at = NOW();
    NEW.last_touch_at = NOW();
    NEW.last_touch_type = 'stage_change';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_changed ON public.crm_contacts;
CREATE TRIGGER trg_stage_changed
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_stage_changed();
