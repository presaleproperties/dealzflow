
-- Create sync_log table
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view sync logs"
ON public.sync_log FOR SELECT
TO authenticated
USING (is_crm_member(auth.uid()));

-- Create booking_events table
CREATE TABLE public.booking_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_name TEXT,
  lead_email TEXT,
  event_type TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view booking events"
ON public.booking_events FOR SELECT
TO authenticated
USING (is_crm_member(auth.uid()));
