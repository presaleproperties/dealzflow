
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT,
  preview_text TEXT,
  html_content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  project_tags TEXT[] NOT NULL DEFAULT '{}',
  area_tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'dealflow',
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (is_crm_member(auth.uid()));

CREATE POLICY "CRM agents+ can insert templates"
  ON public.email_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM agents+ can update templates"
  ON public.email_templates FOR UPDATE
  TO authenticated
  USING (is_crm_member(auth.uid()))
  WITH CHECK (is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM admins can delete templates"
  ON public.email_templates FOR DELETE
  TO authenticated
  USING (is_crm_admin(auth.uid()));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_templates_category ON public.email_templates (category);
CREATE INDEX idx_email_templates_source ON public.email_templates (source);
CREATE INDEX idx_email_templates_project_tags ON public.email_templates USING GIN (project_tags);
CREATE INDEX idx_email_templates_is_active ON public.email_templates (is_active);
