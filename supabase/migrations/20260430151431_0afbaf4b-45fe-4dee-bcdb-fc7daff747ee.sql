
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_conversations_inbox_flags
  ON public.crm_conversations (is_archived, snoozed_until, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.crm_inbox_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'all',     -- 'all' | 'email' | 'text' | 'sms' | 'whatsapp'
  query text NOT NULL DEFAULT '',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinned boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_inbox_views_user ON public.crm_inbox_views (user_id, sort_order);

ALTER TABLE public.crm_inbox_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_views_select_own" ON public.crm_inbox_views;
CREATE POLICY "inbox_views_select_own" ON public.crm_inbox_views
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inbox_views_insert_own" ON public.crm_inbox_views;
CREATE POLICY "inbox_views_insert_own" ON public.crm_inbox_views
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inbox_views_update_own" ON public.crm_inbox_views;
CREATE POLICY "inbox_views_update_own" ON public.crm_inbox_views
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inbox_views_delete_own" ON public.crm_inbox_views;
CREATE POLICY "inbox_views_delete_own" ON public.crm_inbox_views
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_crm_inbox_views_touch
  BEFORE UPDATE ON public.crm_inbox_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
