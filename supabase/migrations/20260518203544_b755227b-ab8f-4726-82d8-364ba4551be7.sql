
-- Telnyx provider columns on existing message log
ALTER TABLE public.crm_sms_log
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'telnyx',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS messaging_profile_id text,
  ADD COLUMN IF NOT EXISTS price_amount numeric,
  ADD COLUMN IF NOT EXISTS price_currency text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_sms_log_provider_msg_id_uq
  ON public.crm_sms_log (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Telnyx voice columns on existing call log
ALTER TABLE public.crm_call_log
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'telnyx',
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS provider_leg_id text,
  ADD COLUMN IF NOT EXISTS connection_id text,
  ADD COLUMN IF NOT EXISTS recording_urls text[],
  ADD COLUMN IF NOT EXISTS hangup_cause text,
  ADD COLUMN IF NOT EXISTS price_amount numeric,
  ADD COLUMN IF NOT EXISTS price_currency text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_call_log_provider_call_id_uq
  ON public.crm_call_log (provider, provider_call_id)
  WHERE provider_call_id IS NOT NULL;

-- Raw webhook audit (every Telnyx event lands here for replay/debug)
CREATE TABLE IF NOT EXISTS public.telnyx_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  event_id text UNIQUE,
  resource_kind text,            -- 'messaging' | 'call' | 'recording' | 'other'
  resource_id text,
  payload jsonb NOT NULL,
  signature_ok boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telnyx_webhook_events_created_idx
  ON public.telnyx_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS telnyx_webhook_events_kind_idx
  ON public.telnyx_webhook_events (resource_kind, resource_id);

ALTER TABLE public.telnyx_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admins can inspect; service role bypasses RLS for inserts/updates.
DROP POLICY IF EXISTS "telnyx_webhook_events_admin_select" ON public.telnyx_webhook_events;
CREATE POLICY "telnyx_webhook_events_admin_select"
  ON public.telnyx_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
