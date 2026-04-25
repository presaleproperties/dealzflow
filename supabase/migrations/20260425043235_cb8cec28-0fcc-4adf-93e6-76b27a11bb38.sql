CREATE TABLE IF NOT EXISTS public.crm_email_send_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  template_id UUID,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  recipient_ids UUID[] NOT NULL DEFAULT '{}',
  total_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_email_send_jobs_created_by ON public.crm_email_send_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_email_send_jobs_status ON public.crm_email_send_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crm_email_send_jobs_created_at ON public.crm_email_send_jobs(created_at DESC);

ALTER TABLE public.crm_email_send_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view email send jobs"
ON public.crm_email_send_jobs FOR SELECT TO authenticated
USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM members can create email send jobs"
ON public.crm_email_send_jobs FOR INSERT TO authenticated
WITH CHECK (public.is_crm_member(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "CRM admins can update email send jobs"
ON public.crm_email_send_jobs FOR UPDATE TO authenticated
USING (public.is_crm_admin(auth.uid()));

CREATE TRIGGER update_crm_email_send_jobs_updated_at
BEFORE UPDATE ON public.crm_email_send_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();