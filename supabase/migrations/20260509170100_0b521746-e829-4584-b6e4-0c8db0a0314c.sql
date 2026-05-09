
REVOKE EXECUTE ON FUNCTION public.crm_compute_engagement_score(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_within_quiet_hours(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_send_notification(uuid[], text, text, text, text, text, text, int, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_replay_recent_activity(uuid, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_warmup_digest_candidates() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.crm_compute_engagement_score(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_within_quiet_hours(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_send_notification(uuid[], text, text, text, text, text, text, int, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_replay_recent_activity(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_warmup_digest_candidates() TO authenticated, service_role;
