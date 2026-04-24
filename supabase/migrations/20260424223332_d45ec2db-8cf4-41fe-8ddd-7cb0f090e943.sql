-- Tracking columns on crm_email_log so the activity feed can show open/click signal.
ALTER TABLE public.crm_email_log
  ADD COLUMN IF NOT EXISTS tracking_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_email_log_tracking_id
  ON public.crm_email_log (tracking_id)
  WHERE tracking_id IS NOT NULL;