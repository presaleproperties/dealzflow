CREATE TABLE IF NOT EXISTS public.crm_email_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  template_id text,
  to_emails text[] NOT NULL,
  cc text,
  bcc text,
  subject text NOT NULL,
  body_html text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_email_schedule_due
  ON public.crm_email_schedule (status, send_at)
  WHERE status = 'pending';

ALTER TABLE public.crm_email_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view scheduled emails"
  ON public.crm_email_schedule FOR SELECT
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM agents+ can insert scheduled emails"
  ON public.crm_email_schedule FOR INSERT
  WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM agents+ can update scheduled emails"
  ON public.crm_email_schedule FOR UPDATE
  USING (public.is_crm_member(auth.uid()))
  WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM admins can delete scheduled emails"
  ON public.crm_email_schedule FOR DELETE
  USING (public.is_crm_admin(auth.uid()));

CREATE TRIGGER update_crm_email_schedule_updated_at
  BEFORE UPDATE ON public.crm_email_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();