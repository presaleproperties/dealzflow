REVOKE ALL ON FUNCTION public.crm_get_or_create_conversation(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_update_conversation_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sync_sms_log_to_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sync_email_log_to_messages() FROM PUBLIC, anon, authenticated;