
-- Add channel column to all messaging tables
ALTER TABLE public.crm_sms_log
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms'
  CHECK (channel IN ('sms','whatsapp'));

ALTER TABLE public.crm_sms_templates
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms'
  CHECK (channel IN ('sms','whatsapp'));

ALTER TABLE public.crm_sms_campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms'
  CHECK (channel IN ('sms','whatsapp'));

ALTER TABLE public.crm_sms_numbers
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms'
  CHECK (channel IN ('sms','whatsapp','both'));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_channel ON public.crm_sms_log (channel, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sms_templates_channel ON public.crm_sms_templates (channel);
CREATE INDEX IF NOT EXISTS idx_crm_sms_campaigns_channel ON public.crm_sms_campaigns (channel, created_at DESC);

-- Add WhatsApp-specific settings columns to crm_sms_settings
ALTER TABLE public.crm_sms_settings
  ADD COLUMN IF NOT EXISTS whatsapp_from text,
  ADD COLUMN IF NOT EXISTS whatsapp_messaging_service_sid text,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false;
