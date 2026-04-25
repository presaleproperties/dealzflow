CREATE OR REPLACE FUNCTION public.count_potential_duplicates()
RETURNS TABLE (
  groups_count BIGINT,
  records_count BIGINT,
  extra_records BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT AS groups_count,
    COALESCE(SUM(dup_count), 0)::BIGINT AS records_count,
    COALESCE(SUM(dup_count - 1), 0)::BIGINT AS extra_records
  FROM public.crm_potential_duplicates;
$$;

REVOKE ALL ON FUNCTION public.count_potential_duplicates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_potential_duplicates() TO authenticated;