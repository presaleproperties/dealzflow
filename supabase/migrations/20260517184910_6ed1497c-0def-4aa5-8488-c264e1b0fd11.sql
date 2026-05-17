ALTER TABLE public.zara_messages ADD COLUMN IF NOT EXISTS page_context jsonb;

ALTER TABLE public.zara_conversations
  ADD COLUMN IF NOT EXISTS last_message_snippet text,
  ADD COLUMN IF NOT EXISTS title_regenerated_at_turn int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_zara_conv_recent ON public.zara_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_conv_pinned ON public.zara_conversations(pinned) WHERE pinned = true;