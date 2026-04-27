-- Add client-side dedupe column so retried sends from the offline outbox never create duplicate text rows
ALTER TABLE public.crm_sms_log
  ADD COLUMN IF NOT EXISTS client_dedupe_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_sms_log_client_dedupe
  ON public.crm_sms_log (client_dedupe_id)
  WHERE client_dedupe_id IS NOT NULL;