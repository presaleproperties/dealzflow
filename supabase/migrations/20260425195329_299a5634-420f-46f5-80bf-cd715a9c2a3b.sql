CREATE OR REPLACE FUNCTION public.contact_related_counts(_contact_ids UUID[])
RETURNS TABLE (
  contact_id UUID,
  notes_count BIGINT,
  tasks_count BIGINT,
  showings_count BIGINT,
  messages_count BIGINT,
  emails_count BIGINT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (SELECT unnest(_contact_ids) AS id)
  SELECT
    ids.id AS contact_id,
    COALESCE((SELECT COUNT(*) FROM public.crm_notes n WHERE n.contact_id = ids.id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM public.crm_tasks t WHERE t.contact_id = ids.id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM public.crm_showings s WHERE s.contact_id = ids.id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM public.crm_messages m WHERE m.contact_id = ids.id), 0)::BIGINT,
    COALESCE((SELECT COUNT(*) FROM public.crm_email_log e WHERE e.contact_id = ids.id), 0)::BIGINT,
    (
      COALESCE((SELECT COUNT(*) FROM public.crm_notes n WHERE n.contact_id = ids.id), 0) +
      COALESCE((SELECT COUNT(*) FROM public.crm_tasks t WHERE t.contact_id = ids.id), 0) +
      COALESCE((SELECT COUNT(*) FROM public.crm_showings s WHERE s.contact_id = ids.id), 0) +
      COALESCE((SELECT COUNT(*) FROM public.crm_messages m WHERE m.contact_id = ids.id), 0) +
      COALESCE((SELECT COUNT(*) FROM public.crm_email_log e WHERE e.contact_id = ids.id), 0)
    )::BIGINT
  FROM ids;
$$;

REVOKE ALL ON FUNCTION public.contact_related_counts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_related_counts(UUID[]) TO authenticated;