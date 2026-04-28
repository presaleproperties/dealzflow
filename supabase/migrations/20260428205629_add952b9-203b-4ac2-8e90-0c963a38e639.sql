ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS headshot_focal_y smallint DEFAULT 30,
  ADD COLUMN IF NOT EXISTS presale_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS presale_synced_at timestamptz;