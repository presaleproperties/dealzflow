
-- Project inventory completeness
ALTER TABLE public.crm_projects
  ADD COLUMN IF NOT EXISTS incentives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assignment_rules text;

ALTER TABLE public.presale_projects
  ADD COLUMN IF NOT EXISTS incentives jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assignment_rules text;

-- Lookup misses — Zara flags when she had to use {LOOKUP:...} because data was missing
CREATE TABLE IF NOT EXISTS public.zara_lookup_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  project_slug text,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  surface text,
  draft_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zara_lookup_misses_topic ON public.zara_lookup_misses(topic);
CREATE INDEX IF NOT EXISTS idx_zara_lookup_misses_project_slug ON public.zara_lookup_misses(project_slug);
CREATE INDEX IF NOT EXISTS idx_zara_lookup_misses_created_at ON public.zara_lookup_misses(created_at DESC);

ALTER TABLE public.zara_lookup_misses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read lookup misses"
  ON public.zara_lookup_misses FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins update lookup misses"
  ON public.zara_lookup_misses FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Service role inserts (no RLS policy needed; service role bypasses RLS)

-- Website content corpus — extend zara_knowledge_documents with crawl metadata
ALTER TABLE public.zara_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz,
  ADD COLUMN IF NOT EXISTS crawl_etag text;

CREATE INDEX IF NOT EXISTS idx_zara_knowledge_documents_source_url ON public.zara_knowledge_documents(source_url);
