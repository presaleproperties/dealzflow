ALTER TABLE public.crm_email_schedule
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;

ALTER TABLE public.crm_sms_log
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_crm_email_schedule_retry_due
  ON public.crm_email_schedule (status, send_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_crm_sms_log_retry_due
  ON public.crm_sms_log (status, scheduled_for)
  WHERE status IN ('scheduled', 'queued');