-- Background embedding retry queue for Zara
CREATE TABLE IF NOT EXISTS public.zara_embed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('winning_conversation','knowledge_document','knowledge_chunk')),
  target_id uuid NOT NULL,
  embed_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zara_embed_queue_due_idx
  ON public.zara_embed_queue (status, next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE INDEX IF NOT EXISTS zara_embed_queue_target_idx
  ON public.zara_embed_queue (kind, target_id);

CREATE TRIGGER zara_embed_queue_updated_at
  BEFORE UPDATE ON public.zara_embed_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.zara_embed_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated CRM users can enqueue their own jobs
CREATE POLICY "crm users can enqueue embed jobs"
  ON public.zara_embed_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can see their own jobs; admins see all
CREATE POLICY "view own embed jobs"
  ON public.zara_embed_queue FOR SELECT
  TO authenticated
  USING (
    enqueued_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.crm_team WHERE user_id = auth.uid() AND role IN ('owner','admin'))
  );

-- Admins can manage
CREATE POLICY "admins manage embed queue"
  ON public.zara_embed_queue FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_team WHERE user_id = auth.uid() AND role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_team WHERE user_id = auth.uid() AND role IN ('owner','admin')));