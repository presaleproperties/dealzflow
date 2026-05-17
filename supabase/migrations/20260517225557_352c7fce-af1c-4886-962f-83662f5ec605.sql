
CREATE TABLE IF NOT EXISTS public.crm_presale_sync_audit (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  slug TEXT NOT NULL,
  project_id UUID,
  field TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('inserted','updated','preserved','unchanged')),
  old_value TEXT,
  new_value TEXT,
  actor TEXT,
  mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_presale_sync_audit_run ON public.crm_presale_sync_audit (run_id, slug);
CREATE INDEX IF NOT EXISTS idx_crm_presale_sync_audit_slug_created ON public.crm_presale_sync_audit (slug, created_at DESC);

ALTER TABLE public.crm_presale_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can read presale sync audit"
ON public.crm_presale_sync_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid()
      AND t.is_active = true
      AND t.role IN ('owner','admin')
  )
);
