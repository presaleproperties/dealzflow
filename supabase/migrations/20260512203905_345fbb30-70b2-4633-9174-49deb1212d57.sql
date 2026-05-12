-- Idempotency: a single Stripe session can produce exactly one booking.
-- Partial unique index so legacy rows (NULL session) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS crm_scheduler_bookings_stripe_session_uq
  ON public.crm_scheduler_bookings (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;