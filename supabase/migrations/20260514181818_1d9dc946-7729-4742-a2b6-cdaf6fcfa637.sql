REVOKE ALL ON FUNCTION public.crm_zara_behavior_score() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_zara_pending_drafts_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_zara_behavior_score() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_zara_pending_drafts_count() TO authenticated, service_role;