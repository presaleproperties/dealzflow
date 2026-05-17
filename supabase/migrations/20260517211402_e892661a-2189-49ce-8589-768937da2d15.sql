ALTER TABLE public.zara_suggested_replies
  ADD COLUMN IF NOT EXISTS citations jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.zara_suggested_replies.citations IS
  'Lightweight citations for RAG-grounded pitches. Array of { n:int, name, source, id, slug, city, similarity }.';