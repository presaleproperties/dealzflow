
-- 1. Asset URL columns on crm_projects (manual uploads override)
ALTER TABLE public.crm_projects
  ADD COLUMN IF NOT EXISTS brochure_url text,
  ADD COLUMN IF NOT EXISTS brochure_filename text,
  ADD COLUMN IF NOT EXISTS floor_plans_url text,
  ADD COLUMN IF NOT EXISTS floor_plans_filename text,
  ADD COLUMN IF NOT EXISTS pricing_url text,
  ADD COLUMN IF NOT EXISTS pricing_filename text;

-- 2. Private storage bucket for uploaded PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-project-assets', 'crm-project-assets', false)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies on storage.objects for this bucket
DROP POLICY IF EXISTS "CRM members can read project assets" ON storage.objects;
CREATE POLICY "CRM members can read project assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'crm-project-assets'
  AND EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid() AND t.is_active = true
  )
);

DROP POLICY IF EXISTS "CRM agents can upload project assets" ON storage.objects;
CREATE POLICY "CRM agents can upload project assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'crm-project-assets'
  AND public.is_crm_agent_or_above(auth.uid())
);

DROP POLICY IF EXISTS "CRM agents can update project assets" ON storage.objects;
CREATE POLICY "CRM agents can update project assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'crm-project-assets'
  AND public.is_crm_agent_or_above(auth.uid())
);

DROP POLICY IF EXISTS "CRM admins can delete project assets" ON storage.objects;
CREATE POLICY "CRM admins can delete project assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'crm-project-assets'
  AND public.is_crm_admin(auth.uid())
);
