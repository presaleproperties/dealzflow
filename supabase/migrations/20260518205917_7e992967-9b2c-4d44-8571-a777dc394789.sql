ALTER TABLE public.crm_sms_log ALTER COLUMN media_urls DROP NOT NULL;
ALTER TABLE public.crm_sms_log ALTER COLUMN media_urls SET DEFAULT '{}'::text[];