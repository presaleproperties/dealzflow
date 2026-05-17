-- 1. crm_projects embedding column + index
ALTER TABLE public.crm_projects
  ADD COLUMN IF NOT EXISTS deep_dive_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS deep_dive_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_projects_deep_dive_hnsw_idx
  ON public.crm_projects
  USING hnsw (deep_dive_embedding vector_cosine_ops);

-- 2. Allow new queue kind
ALTER TABLE public.zara_embed_queue DROP CONSTRAINT IF EXISTS zara_embed_queue_kind_check;
ALTER TABLE public.zara_embed_queue ADD CONSTRAINT zara_embed_queue_kind_check
  CHECK (kind = ANY (ARRAY['winning_conversation','knowledge_document','knowledge_chunk','presale_project','crm_project']));

-- 3. Text builder for crm_projects
CREATE OR REPLACE FUNCTION public.zara_build_crm_project_deep_dive_text(_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    concat_ws(E'\n',
      'PROJECT: ' || coalesce(p.name, ''),
      'DEVELOPER: ' || coalesce(p.developer, '(unknown)'),
      'LOCATION: ' || coalesce(p.city, '?') ||
        coalesce(' / ' || nullif(p.neighborhood, ''), '') ||
        coalesce(', ' || nullif(p.province, ''), ''),
      'PROPERTY TYPE: ' || coalesce(p.property_type, '(unspecified)'),
      'BEDROOMS OFFERED: ' || coalesce(array_to_string(p.bedrooms_offered, ', '), '(unspecified)'),
      'PRICE BAND: ' ||
        coalesce(to_char(p.price_from, 'FM$999,999,999'), '?') ||
        ' - ' ||
        coalesce(to_char(p.price_to, 'FM$999,999,999'), '?'),
      'STATUS: ' || coalesce(p.status, ''),
      'COMPLETION: ' || coalesce(to_char(p.completion_date, 'YYYY-MM'), '(tbd)'),
      'ALIASES: ' || coalesce(array_to_string(p.aliases, ', '), ''),
      'WEBSITE: ' || coalesce(p.website_url, p.marketing_url, ''),
      'NOTES: ' || coalesce(p.notes, '')
    )
  FROM public.crm_projects p
  WHERE p.id = _project_id
$$;

-- 4. Unified match function: union of crm + presale, top N
DROP FUNCTION IF EXISTS public.zara_match_projects(vector, integer, text);

CREATE OR REPLACE FUNCTION public.zara_match_projects(
  query_embedding vector(1536),
  match_count integer DEFAULT 3,
  city_filter text DEFAULT NULL
)
RETURNS TABLE (
  source text,
  id uuid,
  slug text,
  name text,
  developer text,
  city text,
  neighborhood text,
  uzair_pitch text,
  who_this_fits text,
  common_objections text[],
  honest_caveats text,
  price_range_low numeric,
  price_range_high numeric,
  completion_year integer,
  status text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH presale_hits AS (
    SELECT
      'presale'::text AS source,
      p.id, p.slug, p.name, p.developer, p.city, p.neighborhood,
      p.uzair_pitch, p.who_this_fits, p.common_objections, p.honest_caveats,
      p.price_range_low::numeric AS price_range_low,
      p.price_range_high::numeric AS price_range_high,
      p.completion_year, p.status,
      1 - (p.deep_dive_embedding <=> query_embedding) AS similarity
    FROM public.presale_projects p
    WHERE p.deep_dive_embedding IS NOT NULL
      AND p.status <> 'archived'
      AND (city_filter IS NULL OR lower(p.city) = lower(city_filter))
    ORDER BY p.deep_dive_embedding <=> query_embedding
    LIMIT greatest(1, least(coalesce(match_count, 3), 10))
  ),
  crm_hits AS (
    SELECT
      'crm'::text AS source,
      c.id, c.slug, c.name, c.developer, c.city, c.neighborhood,
      NULL::text AS uzair_pitch, NULL::text AS who_this_fits,
      NULL::text[] AS common_objections, NULL::text AS honest_caveats,
      c.price_from AS price_range_low,
      c.price_to AS price_range_high,
      extract(year from c.completion_date)::integer AS completion_year,
      c.status,
      1 - (c.deep_dive_embedding <=> query_embedding) AS similarity
    FROM public.crm_projects c
    WHERE c.deep_dive_embedding IS NOT NULL
      AND c.is_active = true
      AND (city_filter IS NULL OR lower(c.city) = lower(city_filter))
    ORDER BY c.deep_dive_embedding <=> query_embedding
    LIMIT greatest(1, least(coalesce(match_count, 3), 10))
  )
  SELECT * FROM (
    SELECT * FROM presale_hits
    UNION ALL
    SELECT * FROM crm_hits
  ) u
  ORDER BY similarity DESC
  LIMIT greatest(1, least(coalesce(match_count, 3), 10))
$$;

REVOKE ALL ON FUNCTION public.zara_match_projects(vector, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zara_match_projects(vector, integer, text) TO authenticated, service_role;

-- 5. Extend enqueue to cover crm_projects
CREATE OR REPLACE FUNCTION public.zara_enqueue_project_embeddings(_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enq integer := 0;
  r record;
  txt text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin'])
  ) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Presale projects
  FOR r IN
    SELECT id FROM public.presale_projects
    WHERE status <> 'archived'
      AND (_force
           OR deep_dive_embedding IS NULL
           OR deep_dive_updated_at IS NULL
           OR deep_dive_updated_at < now() - interval '7 days')
  LOOP
    txt := public.zara_build_project_deep_dive_text(r.id);
    IF txt IS NULL OR length(btrim(txt)) < 20 THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.zara_embed_queue
      WHERE kind = 'presale_project' AND target_id = r.id
        AND status IN ('pending','processing')
    ) THEN CONTINUE; END IF;
    INSERT INTO public.zara_embed_queue(kind, target_id, embed_text, enqueued_by)
    VALUES ('presale_project', r.id, txt, auth.uid());
    enq := enq + 1;
  END LOOP;

  -- CRM projects
  FOR r IN
    SELECT id FROM public.crm_projects
    WHERE is_active = true
      AND (_force
           OR deep_dive_embedding IS NULL
           OR deep_dive_updated_at IS NULL
           OR deep_dive_updated_at < now() - interval '7 days')
  LOOP
    txt := public.zara_build_crm_project_deep_dive_text(r.id);
    IF txt IS NULL OR length(btrim(txt)) < 20 THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.zara_embed_queue
      WHERE kind = 'crm_project' AND target_id = r.id
        AND status IN ('pending','processing')
    ) THEN CONTINUE; END IF;
    INSERT INTO public.zara_embed_queue(kind, target_id, embed_text, enqueued_by)
    VALUES ('crm_project', r.id, txt, auth.uid());
    enq := enq + 1;
  END LOOP;

  RETURN enq;
END;
$$;

REVOKE ALL ON FUNCTION public.zara_enqueue_project_embeddings(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zara_enqueue_project_embeddings(boolean) TO authenticated, service_role;