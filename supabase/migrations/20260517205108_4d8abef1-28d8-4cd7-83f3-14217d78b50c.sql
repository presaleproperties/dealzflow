ALTER TABLE public.zara_suggested_replies
  ADD COLUMN IF NOT EXISTS edited_text text,
  ADD COLUMN IF NOT EXISTS edit_distance integer,
  ADD COLUMN IF NOT EXISTS escalate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalate_reason text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS escalation_model text;

CREATE INDEX IF NOT EXISTS zara_suggested_replies_intent_created_idx
  ON public.zara_suggested_replies (intent, created_at DESC);

CREATE INDEX IF NOT EXISTS zara_suggested_replies_status_created_idx
  ON public.zara_suggested_replies (status, created_at DESC);