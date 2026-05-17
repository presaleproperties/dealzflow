-- 1. Allow new queue kind
ALTER TABLE public.zara_embed_queue DROP CONSTRAINT IF EXISTS zara_embed_queue_kind_check;
ALTER TABLE public.zara_embed_queue ADD CONSTRAINT zara_embed_queue_kind_check
  CHECK (kind = ANY (ARRAY['winning_conversation','knowledge_document','knowledge_chunk','presale_project']));

-- 2. HNSW index for fast cosine search on project embeddings
CREATE INDEX IF NOT EXISTS presale_projects_deep_dive_hnsw_idx
  ON public.presale_projects
  USING hnsw (deep_dive_embedding vector_cosine_ops);

-- 3. Builder: canonical text Zara reasons over for a single project
CREATE OR REPLACE FUNCTION public.zara_build_project_deep_dive_text(_project_id uuid)
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
      'LOCATION: ' || coalesce(p.city, '?') || coalesce(' / ' || nullif(p.neighborhood, ''), ''),
      'BUILDING TYPE: ' || coalesce(p.building_type, '(unspecified)'),
      'UNIT TYPES: ' || coalesce(array_to_string(p.unit_types, ', '), '(unspecified)'),
      'PRICE BAND: ' ||
        coalesce(to_char(p.price_range_low, 'FM$999,999,999'), '?') ||
        ' - ' ||
        coalesce(to_char(p.price_range_high, 'FM$999,999,999'), '?') ||
        coalesce(' (starting psf $' || p.starting_psf::text || ')', ''),
      'DEPOSIT STRUCTURE: ' || coalesce(p.deposit_structure, '(unspecified)'),
      'COMPLETION: ' || coalesce(p.completion_quarter, '') || ' ' || coalesce(p.completion_year::text, ''),
      'STATUS: ' || coalesce(p.status, ''),
      'VIP ACCESS: ' || case when p.vip_access then 'yes' else 'no' end,
      'KEY FEATURES: ' || coalesce((
        SELECT string_agg(value::text, '; ')
        FROM jsonb_array_elements_text(coalesce(p.key_features, '[]'::jsonb))
      ), '(none captured)'),
      'DESCRIPTION: ' || coalesce(p.description, ''),
      'UZAIR PITCH: ' || coalesce(p.uzair_pitch, ''),
      'WHO THIS FITS: ' || coalesce(p.who_this_fits, ''),
      'WHO THIS DOES NOT FIT: ' || coalesce(p.who_this_doesnt_fit, ''),
      'COMMON OBJECTIONS: ' || coalesce(array_to_string(p.common_objections, ' | '), ''),
      'HONEST CAVEATS: ' || coalesce(p.honest_caveats, ''),
      'MORTGAGE BROKER NOTE: ' || coalesce(p.mortgage_broker_note, '')
    )
  FROM public.presale_projects p
  WHERE p.id = _project_id
$$;

-- 4. Vector match RPC (security definer; we already gate access at the function level)
CREATE OR REPLACE FUNCTION public.zara_match_projects(
  query_embedding vector(1536),
  match_count integer DEFAULT 3,
  city_filter text DEFAULT NULL
)
RETURNS TABLE (
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
  price_range_low integer,
  price_range_high integer,
  completion_year integer,
  status text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.slug,
    p.name,
    p.developer,
    p.city,
    p.neighborhood,
    p.uzair_pitch,
    p.who_this_fits,
    p.common_objections,
    p.honest_caveats,
    p.price_range_low,
    p.price_range_high,
    p.completion_year,
    p.status,
    1 - (p.deep_dive_embedding <=> query_embedding) AS similarity
  FROM public.presale_projects p
  WHERE p.deep_dive_embedding IS NOT NULL
    AND p.status <> 'archived'
    AND (city_filter IS NULL OR lower(p.city) = lower(city_filter))
  ORDER BY p.deep_dive_embedding <=> query_embedding
  LIMIT greatest(1, least(coalesce(match_count, 3), 10))
$$;

REVOKE ALL ON FUNCTION public.zara_match_projects(vector, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zara_match_projects(vector, integer, text) TO authenticated, service_role;

-- 5. Admin: enqueue stale project embeddings
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

  FOR r IN
    SELECT id FROM public.presale_projects
    WHERE status <> 'archived'
      AND (_force
           OR deep_dive_embedding IS NULL
           OR deep_dive_updated_at IS NULL
           OR deep_dive_updated_at < now() - interval '7 days')
  LOOP
    txt := public.zara_build_project_deep_dive_text(r.id);
    IF txt IS NULL OR length(btrim(txt)) < 20 THEN
      CONTINUE;
    END IF;

    -- Avoid duplicate pending jobs for the same project
    IF EXISTS (
      SELECT 1 FROM public.zara_embed_queue
      WHERE kind = 'presale_project' AND target_id = r.id
        AND status IN ('pending','processing')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.zara_embed_queue(kind, target_id, embed_text, enqueued_by)
    VALUES ('presale_project', r.id, txt, auth.uid());
    enq := enq + 1;
  END LOOP;

  RETURN enq;
END;
$$;

REVOKE ALL ON FUNCTION public.zara_enqueue_project_embeddings(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zara_enqueue_project_embeddings(boolean) TO authenticated, service_role;