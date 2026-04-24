
-- ── crm_email_send_log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  template_type TEXT,
  template_id UUID,
  campaign_id UUID,
  opened_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  tracking_id TEXT UNIQUE,
  clicked_at TIMESTAMPTZ,
  click_count INT NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  clicked_url TEXT,
  presale_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_send_log_sent_at ON public.crm_email_send_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_email_send_log_contact ON public.crm_email_send_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_send_log_status ON public.crm_email_send_log(status);
ALTER TABLE public.crm_email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read send log" ON public.crm_email_send_log FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm members insert send log" ON public.crm_email_send_log FOR INSERT WITH CHECK (public.is_crm_member(auth.uid()));
CREATE POLICY "crm members update send log" ON public.crm_email_send_log FOR UPDATE USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm members delete send log" ON public.crm_email_send_log FOR DELETE USING (public.is_crm_member(auth.uid()));

-- ── crm_email_workflows ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_email_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  audience_type TEXT NOT NULL DEFAULT 'lead',
  trigger_event TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_email_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read workflows" ON public.crm_email_workflows FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm admins write workflows" ON public.crm_email_workflows FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));
CREATE TRIGGER trg_crm_email_workflows_updated BEFORE UPDATE ON public.crm_email_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── crm_email_workflow_steps ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_email_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.crm_email_workflows(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  template_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_workflow_steps_wf ON public.crm_email_workflow_steps(workflow_id, step_order);
ALTER TABLE public.crm_email_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read steps" ON public.crm_email_workflow_steps FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm admins write steps" ON public.crm_email_workflow_steps FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

-- ── crm_email_jobs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.crm_email_workflows(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.crm_email_workflow_steps(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  template_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_jobs_status ON public.crm_email_jobs(status, scheduled_at);
ALTER TABLE public.crm_email_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read jobs" ON public.crm_email_jobs FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm admins write jobs" ON public.crm_email_jobs FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

-- ── crm_ad_spend ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_ad_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date DATE NOT NULL,
  utm_source TEXT NOT NULL,
  utm_campaign TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CAD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_ad_spend_date ON public.crm_ad_spend(spend_date DESC);
ALTER TABLE public.crm_ad_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read spend" ON public.crm_ad_spend FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm admins write spend" ON public.crm_ad_spend FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

-- ── crm_email_audit_runs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_email_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  status TEXT NOT NULL,
  total_links INT NOT NULL DEFAULT 0,
  total_errors INT NOT NULL DEFAULT 0,
  projects_sampled INT NOT NULL DEFAULT 0,
  errors JSONB,
  trigger_source TEXT,
  duration_ms INT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_audit_ran_at ON public.crm_email_audit_runs(ran_at DESC);
ALTER TABLE public.crm_email_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm members read audit" ON public.crm_email_audit_runs FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "crm admins write audit" ON public.crm_email_audit_runs FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));
