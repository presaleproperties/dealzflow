CREATE OR REPLACE FUNCTION public.zara_founder_retrieve(
  _query text,
  _module_slug text DEFAULT NULL,
  _limit int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  module_slug text,
  module_name text,
  title text,
  body text,
  examples text[],
  tags text[],
  weight int,
  score real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q tsquery;
  cleaned text;
  parts text;
BEGIN
  cleaned := regexp_replace(coalesce(_query,''), '[^a-zA-Z0-9 ]+', ' ', 'g');
  cleaned := trim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  IF cleaned = '' THEN
    q := NULL;
  ELSE
    SELECT string_agg(quote_literal(w) || ':*', ' | ')
      INTO parts
      FROM unnest(string_to_array(cleaned, ' ')) AS w
      WHERE length(w) >= 2;
    IF parts IS NULL OR parts = '' THEN
      q := NULL;
    ELSE
      q := to_tsquery('english', parts);
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, m.slug, m.name, p.title, p.body, p.examples, p.tags, p.weight,
    (
      CASE WHEN q IS NULL THEN 0
        ELSE ts_rank(
          to_tsvector('english',
            coalesce(p.title,'') || ' ' ||
            coalesce(p.body,'') || ' ' ||
            array_to_string(coalesce(p.tags,'{}'),' ') || ' ' ||
            array_to_string(coalesce(p.examples,'{}'),' ')
          ),
          q
        )
      END * (1.0 + p.weight::real / 10.0)
    )::real AS score
  FROM public.zara_founder_principles p
  JOIN public.zara_founder_modules m ON m.id = p.module_id
  WHERE p.active = true
    AND (_module_slug IS NULL OR m.slug = _module_slug)
    AND (
      q IS NULL OR
      to_tsvector('english',
        coalesce(p.title,'') || ' ' ||
        coalesce(p.body,'') || ' ' ||
        array_to_string(coalesce(p.tags,'{}'),' ') || ' ' ||
        array_to_string(coalesce(p.examples,'{}'),' ')
      ) @@ q
    )
  ORDER BY score DESC NULLS LAST, p.weight DESC, p.updated_at DESC
  LIMIT GREATEST(coalesce(_limit, 8), 1);
END;
$$;