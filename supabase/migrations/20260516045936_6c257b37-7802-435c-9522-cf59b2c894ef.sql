
ALTER TABLE public.crm_email_log
  ADD COLUMN IF NOT EXISTS human_open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bot_open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_human_opened_at timestamptz;

ALTER TABLE public.crm_email_send_log
  ADD COLUMN IF NOT EXISTS human_open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bot_open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_human_opened_at timestamptz;
