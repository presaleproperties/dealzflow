-- 1a. crm_email_templates.slug
ALTER TABLE public.crm_email_templates ADD COLUMN IF NOT EXISTS slug text;
UPDATE public.crm_email_templates
  SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_email_templates_slug_uidx ON public.crm_email_templates(slug);

-- 1b. crm_projects.slug + presale_slug
ALTER TABLE public.crm_projects ADD COLUMN IF NOT EXISTS slug text;
UPDATE public.crm_projects
  SET slug = lower(regexp_replace(coalesce(name_lower, name), '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_projects_slug_uidx ON public.crm_projects(slug);
ALTER TABLE public.crm_projects ADD COLUMN IF NOT EXISTS presale_slug text;

-- Review table for ambiguous bridge matches (step 2 backfill)
CREATE TABLE IF NOT EXISTS public.crm_projects_presale_match_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.crm_projects(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  candidates jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_projects_presale_match_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM admins can read presale match review"
  ON public.crm_projects_presale_match_review
  FOR SELECT TO authenticated
  USING (public.is_crm_admin(auth.uid()));

-- 4. Mark deprecated tables (no drop)
COMMENT ON TABLE public.email_templates IS 'DEPRECATED 2026-04-27 — duplicate of crm_email_templates. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_send_log IS 'DEPRECATED 2026-04-27 — duplicate of crm_email_log. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_workflows IS 'DEPRECATED 2026-04-27 — superseded by automation engine. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_workflow_steps IS 'DEPRECATED 2026-04-27 — superseded by automation engine. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_jobs IS 'DEPRECATED 2026-04-27 — superseded by automation engine. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_send_jobs IS 'DEPRECATED 2026-04-27 — superseded by gmail-actions canonical send path. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_schedule IS 'DEPRECATED 2026-04-27 — superseded by automation engine. Drop after 2026-06-27.';
COMMENT ON TABLE public.crm_email_audit_runs IS 'DEPRECATED 2026-04-27 — legacy audit table. Drop after 2026-06-27.';
COMMENT ON TABLE public.email_template_versions IS 'DEPRECATED 2026-04-27 — versioning unused. Drop after 2026-06-27.';