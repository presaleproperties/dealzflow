DROP INDEX IF EXISTS public.uniq_sms_numbers_company;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_numbers_company_per_channel
ON public.crm_sms_numbers (channel)
WHERE is_company = true;