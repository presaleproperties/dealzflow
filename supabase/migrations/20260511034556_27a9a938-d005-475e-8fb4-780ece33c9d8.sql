-- Per-thread composer drafts (Build 1)
CREATE TABLE IF NOT EXISTS public.crm_thread_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  body text NOT NULL DEFAULT '',
  quote text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_crm_thread_drafts_user_contact
  ON public.crm_thread_drafts (user_id, contact_id);

ALTER TABLE public.crm_thread_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts: select"
  ON public.crm_thread_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage their own drafts: insert"
  ON public.crm_thread_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own drafts: update"
  ON public.crm_thread_drafts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own drafts: delete"
  ON public.crm_thread_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-bump updated_at
CREATE TRIGGER trg_crm_thread_drafts_updated_at
  BEFORE UPDATE ON public.crm_thread_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();