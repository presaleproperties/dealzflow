-- Add soft-delete column to scheduler bookings
ALTER TABLE public.crm_scheduler_bookings
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Recreate partial unique indexes to exclude soft-deleted rows
DROP INDEX IF EXISTS crm_scheduler_bookings_active_slot_uq;
CREATE UNIQUE INDEX IF NOT EXISTS crm_scheduler_bookings_active_slot_uq
  ON public.crm_scheduler_bookings (agent_user_id, start_at)
  WHERE status IN ('confirmed', 'rescheduled') AND deleted_at IS NULL;

DROP INDEX IF EXISTS crm_scheduler_bookings_stripe_session_uq;
CREATE UNIQUE INDEX IF NOT EXISTS crm_scheduler_bookings_stripe_session_uq
  ON public.crm_scheduler_bookings (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL AND deleted_at IS NULL;