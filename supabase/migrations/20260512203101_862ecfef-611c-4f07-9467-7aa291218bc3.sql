-- Race-proof scheduler bookings: one active booking per agent+start_at.
-- Uses a partial unique index so cancelled/no_show bookings don't block re-booking.
CREATE UNIQUE INDEX IF NOT EXISTS crm_scheduler_bookings_active_slot_uq
  ON public.crm_scheduler_bookings (agent_user_id, start_at)
  WHERE status IN ('confirmed', 'rescheduled');