ALTER TABLE public.zara_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.zara_suggested_replies
  ADD COLUMN IF NOT EXISTS consulted_sources jsonb NOT NULL DEFAULT '{}'::jsonb;