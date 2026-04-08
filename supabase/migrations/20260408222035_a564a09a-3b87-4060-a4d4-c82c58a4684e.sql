
-- Add missing columns to crm_automations
ALTER TABLE public.crm_automations
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS runs_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

-- Create automation logs table
CREATE TABLE public.crm_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  trigger_data jsonb,
  action_result text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view automation logs" ON public.crm_automation_logs FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert automation logs" ON public.crm_automation_logs FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete automation logs" ON public.crm_automation_logs FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

CREATE INDEX idx_automation_logs_automation ON public.crm_automation_logs(automation_id);
CREATE INDEX idx_automation_logs_contact ON public.crm_automation_logs(contact_id);
