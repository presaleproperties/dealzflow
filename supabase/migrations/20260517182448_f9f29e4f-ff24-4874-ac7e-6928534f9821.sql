-- =========================================================================
-- ZARA BRAIN — RAG schema
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -------------------------------------------------------------------------
-- 1. KNOWLEDGE DOCUMENTS  (playbooks, scripts, FAQs, brand voice, etc.)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zara_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'playbook','script','faq','brand_voice','project_brief','market_intel','training_note','other'
  )),
  source text,
  raw_content text NOT NULL,
  file_name text,
  file_size_bytes int,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','chunking','embedding','indexed','failed','archived'
  )),
  total_chunks int NOT NULL DEFAULT 0,
  total_tokens int,
  error_message text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,
  last_retrieved_at timestamptz,
  retrieval_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS zara_knowledge_documents_status_idx
  ON public.zara_knowledge_documents (status);
CREATE INDEX IF NOT EXISTS zara_knowledge_documents_source_type_idx
  ON public.zara_knowledge_documents (source_type);
CREATE INDEX IF NOT EXISTS zara_knowledge_documents_tags_idx
  ON public.zara_knowledge_documents USING GIN (tags);

ALTER TABLE public.zara_knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zkd authenticated read"
  ON public.zara_knowledge_documents FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "zkd authenticated insert"
  ON public.zara_knowledge_documents FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "zkd authenticated update"
  ON public.zara_knowledge_documents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "zkd authenticated delete"
  ON public.zara_knowledge_documents FOR DELETE
  TO authenticated USING (true);

-- -------------------------------------------------------------------------
-- 2. KNOWLEDGE CHUNKS  (vector store — service role writes only)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zara_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.zara_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  token_count int,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zara_knowledge_chunks_document_id_idx
  ON public.zara_knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS zara_knowledge_chunks_embedding_hnsw_idx
  ON public.zara_knowledge_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.zara_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zkc authenticated read"
  ON public.zara_knowledge_chunks FOR SELECT
  TO authenticated USING (true);
-- inserts only via service role (no INSERT policy for authenticated)
CREATE POLICY "zkc authenticated delete"
  ON public.zara_knowledge_chunks FOR DELETE
  TO authenticated USING (true);

-- -------------------------------------------------------------------------
-- 3. WINNING CONVERSATIONS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zara_winning_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_profile text NOT NULL CHECK (lead_profile IN (
    'first_time_buyer','investor','parent_for_kid','upsizer','downsizer','other'
  )),
  primary_language text,
  budget_range text,
  project_type text,
  initial_situation text NOT NULL,
  full_thread text NOT NULL,
  turning_message text NOT NULL,
  why_it_worked text NOT NULL,
  outcome text NOT NULL,
  close_date date,
  source_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  embedding vector(1536),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zwc_lead_profile_idx
  ON public.zara_winning_conversations (lead_profile);
CREATE INDEX IF NOT EXISTS zwc_embedding_hnsw_idx
  ON public.zara_winning_conversations USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.zara_winning_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zwc authenticated read"
  ON public.zara_winning_conversations FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "zwc authenticated insert"
  ON public.zara_winning_conversations FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "zwc authenticated update"
  ON public.zara_winning_conversations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "zwc authenticated delete"
  ON public.zara_winning_conversations FOR DELETE
  TO authenticated USING (true);

-- -------------------------------------------------------------------------
-- 4. PRESALE_PROJECTS — deep-dive columns
-- -------------------------------------------------------------------------
ALTER TABLE public.presale_projects
  ADD COLUMN IF NOT EXISTS uzair_pitch text,
  ADD COLUMN IF NOT EXISTS common_objections text[],
  ADD COLUMN IF NOT EXISTS honest_caveats text,
  ADD COLUMN IF NOT EXISTS who_this_fits text,
  ADD COLUMN IF NOT EXISTS who_this_doesnt_fit text,
  ADD COLUMN IF NOT EXISTS mortgage_broker_note text,
  ADD COLUMN IF NOT EXISTS deep_dive_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS deep_dive_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS presale_projects_deep_dive_hnsw_idx
  ON public.presale_projects USING hnsw (deep_dive_embedding vector_cosine_ops);

-- -------------------------------------------------------------------------
-- 5. MARKET INTEL
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_starting date NOT NULL,
  area text NOT NULL,
  building_type text,
  metric text NOT NULL,
  value numeric NOT NULL,
  source text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_intel_week_area_idx
  ON public.market_intel (week_starting DESC, area);

ALTER TABLE public.market_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mi authenticated read"
  ON public.market_intel FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "mi authenticated insert"
  ON public.market_intel FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "mi authenticated update"
  ON public.market_intel FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mi authenticated delete"
  ON public.market_intel FOR DELETE
  TO authenticated USING (true);

-- -------------------------------------------------------------------------
-- 6. RPCs for vector similarity search (called from edge functions)
-- -------------------------------------------------------------------------

-- Search knowledge chunks
CREATE OR REPLACE FUNCTION public.zara_match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 4
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.chunk_index, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.zara_knowledge_chunks c
  JOIN public.zara_knowledge_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND d.status = 'indexed'
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Search winning conversations
CREATE OR REPLACE FUNCTION public.zara_match_winning_conversations(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.55,
  match_count int DEFAULT 2
)
RETURNS TABLE (
  id uuid,
  lead_profile text,
  initial_situation text,
  turning_message text,
  why_it_worked text,
  outcome text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.id, w.lead_profile, w.initial_situation, w.turning_message,
         w.why_it_worked, w.outcome,
         1 - (w.embedding <=> query_embedding) AS similarity
  FROM public.zara_winning_conversations w
  WHERE w.embedding IS NOT NULL
    AND 1 - (w.embedding <=> query_embedding) > match_threshold
  ORDER BY w.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Search project deep-dives
CREATE OR REPLACE FUNCTION public.zara_match_project_deep_dives(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.55,
  match_count int DEFAULT 2
)
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  uzair_pitch text,
  common_objections text[],
  honest_caveats text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.city, p.uzair_pitch, p.common_objections, p.honest_caveats,
         1 - (p.deep_dive_embedding <=> query_embedding) AS similarity
  FROM public.presale_projects p
  WHERE p.deep_dive_embedding IS NOT NULL
    AND 1 - (p.deep_dive_embedding <=> query_embedding) > match_threshold
  ORDER BY p.deep_dive_embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Bump retrieval counters for cited documents
CREATE OR REPLACE FUNCTION public.zara_bump_retrieval_counts(doc_ids uuid[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.zara_knowledge_documents
     SET retrieval_count = retrieval_count + 1,
         last_retrieved_at = now()
   WHERE id = ANY(doc_ids);
$$;

GRANT EXECUTE ON FUNCTION public.zara_match_knowledge_chunks(vector, float, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zara_match_winning_conversations(vector, float, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zara_match_project_deep_dives(vector, float, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.zara_bump_retrieval_counts(uuid[]) TO authenticated, service_role;