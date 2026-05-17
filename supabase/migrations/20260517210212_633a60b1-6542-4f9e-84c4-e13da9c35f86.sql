ALTER TABLE public.zara_lead_memory
  ADD COLUMN IF NOT EXISTS facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS turn_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_rolled_at timestamptz;

CREATE INDEX IF NOT EXISTS zara_lead_memory_last_rolled_idx
  ON public.zara_lead_memory(last_rolled_at);

-- Admin-only flag to request a full rebuild (consumed by zara-roll-memory).
CREATE OR REPLACE FUNCTION public.zara_request_memory_rebuild(_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin'])
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  INSERT INTO public.zara_lead_memory(contact_id, summary, facts, turn_count, version, refresh_reason, refreshed_at)
  VALUES (_contact_id, '', '{}'::jsonb, 0, 1, 'rebuild_requested', now())
  ON CONFLICT (contact_id) DO UPDATE
    SET facts = '{}'::jsonb,
        summary = '',
        turn_count = 0,
        version = zara_lead_memory.version + 1,
        refresh_reason = 'rebuild_requested',
        refreshed_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.zara_request_memory_rebuild(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zara_request_memory_rebuild(uuid) TO authenticated, service_role;