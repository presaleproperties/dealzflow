-- Payment intents table for paid scheduler events
CREATE TABLE IF NOT EXISTS public.crm_scheduler_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_slug text NOT NULL,
  event_slug text NOT NULL,
  start_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Vancouver',
  invitee_payload jsonb NOT NULL,
  answers_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  referrer text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'cad',
  stripe_session_id text,
  status text NOT NULL DEFAULT 'pending', -- pending | completed | failed | expired
  booking_id uuid REFERENCES public.crm_scheduler_bookings(id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_pi_session ON public.crm_scheduler_payment_intents(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_pi_status ON public.crm_scheduler_payment_intents(status, created_at);

ALTER TABLE public.crm_scheduler_payment_intents ENABLE ROW LEVEL SECURITY;

-- Service role only (used by edge functions exclusively)
CREATE POLICY "service_role_all_pi"
  ON public.crm_scheduler_payment_intents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Reschedule + cancellation audit columns on bookings
ALTER TABLE public.crm_scheduler_bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS rescheduled_to_booking_id uuid REFERENCES public.crm_scheduler_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduler_bookings_resched ON public.crm_scheduler_bookings(rescheduled_to_booking_id);

-- Daily digest cron — 14:00 UTC ≈ 7am Vancouver
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'scheduler-daily-digest';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'scheduler-daily-digest',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/scheduler-daily-digest',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YmlscXZ1ZGtrZGhzbHhlYmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTM1MzYsImV4cCI6MjA4MzQ2OTUzNn0.PgyiztrokbiRoS1y9qzYAgZ7Zlq2g_z6InPveD7xkoI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);