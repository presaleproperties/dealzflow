ALTER TABLE public.crm_sms_numbers
DROP CONSTRAINT IF EXISTS crm_sms_numbers_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS crm_sms_numbers_phone_channel_key
ON public.crm_sms_numbers (phone, channel);