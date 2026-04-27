-- Create crm_activity_events table for real-time presale engagement events
CREATE TABLE IF NOT EXISTS public.crm_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  lead_email TEXT,
  lead_phone TEXT,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  project_slug TEXT,
  agent_slug TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_contact_occurred
  ON public.crm_activity_events (contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_email
  ON public.crm_activity_events (lower(lead_email));
CREATE INDEX IF NOT EXISTS idx_activity_events_type_occurred
  ON public.crm_activity_events (type, occurred_at DESC);

-- Add last_activity_at column on crm_contacts (separate from last_touch_at,
-- which is reserved for human actions per the last-touch rule).
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_last_activity
  ON public.crm_contacts (last_activity_at DESC NULLS LAST);

-- RLS: only CRM members can read; writes happen via service role from the
-- webhook (RLS still requires a permissive insert path for service role,
-- which bypasses RLS by default — so no insert policy needed).
ALTER TABLE public.crm_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can read activity events" ON public.crm_activity_events;
CREATE POLICY "CRM members can read activity events"
  ON public.crm_activity_events
  FOR SELECT
  TO authenticated
  USING (public.is_crm_member(auth.uid()));

-- Enable Realtime
ALTER TABLE public.crm_activity_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_activity_events;