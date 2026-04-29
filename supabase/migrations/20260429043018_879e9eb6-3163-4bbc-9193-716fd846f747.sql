-- 1. Add the missing column
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Backfill (idempotent — DEFAULT covers new rows; this fills any nulls in case the
-- column already existed without a default in some environment).
UPDATE public.crm_team SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

-- 3. Auto-refresh trigger (re-uses existing helper if present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_team_updated_at ON public.crm_team;
CREATE TRIGGER trg_crm_team_updated_at
BEFORE UPDATE ON public.crm_team
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();