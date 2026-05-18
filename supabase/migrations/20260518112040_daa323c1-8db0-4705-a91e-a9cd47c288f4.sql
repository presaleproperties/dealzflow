-- Private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('presale-floorplans', 'presale-floorplans', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins/owners manage; nobody reads directly (signed URLs only via service role)
DROP POLICY IF EXISTS "floorplans admin manage" ON storage.objects;
CREATE POLICY "floorplans admin manage"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'presale-floorplans'
  AND EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin')
  )
)
WITH CHECK (
  bucket_id = 'presale-floorplans'
  AND EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin')
  )
);

-- Index table for floorplan metadata
CREATE TABLE IF NOT EXISTS public.crm_project_floorplans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  bedrooms NUMERIC,
  bathrooms NUMERIC,
  sqft INTEGER,
  price_from NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_slug, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_crm_project_floorplans_slug
  ON public.crm_project_floorplans (project_slug)
  WHERE is_active;

ALTER TABLE public.crm_project_floorplans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "floorplan rows readable by crm team"
ON public.crm_project_floorplans FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid()));

CREATE POLICY "floorplan rows admin manage"
ON public.crm_project_floorplans FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin')));

CREATE TRIGGER trg_crm_project_floorplans_updated
BEFORE UPDATE ON public.crm_project_floorplans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();