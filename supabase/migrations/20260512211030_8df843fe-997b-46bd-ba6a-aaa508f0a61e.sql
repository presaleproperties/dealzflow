-- The stripe_session_uq should enforce exactly one booking per Stripe session,
-- forever. A cancelled/deleted booking must still block re-use of that session.
DROP INDEX IF EXISTS crm_scheduler_bookings_stripe_session_uq;
CREATE UNIQUE INDEX IF NOT EXISTS crm_scheduler_bookings_stripe_session_uq
  ON public.crm_scheduler_bookings (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;