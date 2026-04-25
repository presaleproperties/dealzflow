CREATE OR REPLACE FUNCTION public.crm_distinct_sources()
RETURNS TABLE(source text, usage_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT TRIM(source) AS source, COUNT(*) AS usage_count
  FROM public.crm_contacts
  WHERE source IS NOT NULL AND TRIM(source) <> ''
  GROUP BY TRIM(source)
  ORDER BY COUNT(*) DESC, TRIM(source) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.crm_distinct_sources() TO authenticated;