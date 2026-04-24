ALTER TABLE public.crm_email_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.crm_email_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_email_campaigns_scheduled
  ON public.crm_email_campaigns (scheduled_for)
  WHERE status = 'scheduled';