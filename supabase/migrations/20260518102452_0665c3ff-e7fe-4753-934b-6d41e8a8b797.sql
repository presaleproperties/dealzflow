
ALTER TABLE public.zara_lead_memory
  ADD COLUMN IF NOT EXISTS continuity_openers text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS relationship_stage text,
  ADD COLUMN IF NOT EXISTS last_topics text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS continuity_refreshed_at timestamptz;
