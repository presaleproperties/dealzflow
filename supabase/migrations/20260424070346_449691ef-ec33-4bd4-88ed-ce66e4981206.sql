-- Add Twilio "From" phone number to per-user CRM email settings (reusing the settings row)
ALTER TABLE public.crm_email_settings
  ADD COLUMN IF NOT EXISTS twilio_from_number text;

-- SMS log
CREATE TABLE IF NOT EXISTS public.crm_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'outbound',
  to_number text NOT NULL,
  from_number text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  twilio_message_sid text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sms_log_contact ON public.crm_sms_log(contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_user ON public.crm_sms_log(user_id, sent_at DESC);

ALTER TABLE public.crm_sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can view SMS log" ON public.crm_sms_log;
CREATE POLICY "CRM members can view SMS log"
ON public.crm_sms_log FOR SELECT
TO authenticated
USING (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "Senders can insert their SMS log rows" ON public.crm_sms_log;
CREATE POLICY "Senders can insert their SMS log rows"
ON public.crm_sms_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_crm_member(auth.uid()));

-- Update last_touch on contact when an outbound SMS is logged
CREATE OR REPLACE FUNCTION public.update_last_touch_on_sms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_contacts
  SET last_touch_at = NEW.sent_at,
      last_touch_type = 'sms_sent'
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_last_touch ON public.crm_sms_log;
CREATE TRIGGER trg_sms_last_touch
AFTER INSERT ON public.crm_sms_log
FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_sms();