REVOKE EXECUTE ON FUNCTION public.crm_record_identity(uuid,text,text,text,boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_resolve_contact_identity(text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_attach_alternate(uuid,text,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.crm_sync_contact_identities() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.crm_record_identity(uuid,text,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_resolve_contact_identity(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_attach_alternate(uuid,text,text,text) TO authenticated, service_role;