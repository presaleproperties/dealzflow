REVOKE ALL ON FUNCTION public.crm_scheduler_resolve_slug(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_scheduler_seed_defaults(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_seed_scheduler_on_slug()               FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.crm_scheduler_resolve_slug(text, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_scheduler_seed_defaults(uuid)       TO service_role;