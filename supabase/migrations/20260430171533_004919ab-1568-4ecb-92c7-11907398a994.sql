CREATE TABLE IF NOT EXISTS public.crm_sync_state (
  sync_key TEXT PRIMARY KEY,
  last_cursor TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sync state"
  ON public.crm_sync_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only service role writes (no insert/update policy for users)
