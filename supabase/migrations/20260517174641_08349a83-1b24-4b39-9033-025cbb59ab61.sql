
-- ============================================================
-- ZARA COCKPIT + COMPLETE — Phase 1 schema
-- ============================================================

-- 1) zara_conversations
CREATE TABLE IF NOT EXISTS public.zara_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_conv_user ON public.zara_conversations(user_id, archived, last_message_at DESC NULLS LAST);
ALTER TABLE public.zara_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conv all" ON public.zara_conversations FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2) zara_messages
CREATE TABLE IF NOT EXISTS public.zara_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.zara_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text,
  tool_name text,
  tool_calls jsonb,
  tool_call_id text,
  tool_result jsonb,
  input_tokens int,
  output_tokens int,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_msg_conv ON public.zara_messages(conversation_id, created_at);
ALTER TABLE public.zara_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg select own conv" ON public.zara_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.zara_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);
-- Inserts via service_role only (edge fn); no insert policy for authenticated.

-- 3) zara_actions_log
CREATE TABLE IF NOT EXISTS public.zara_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.zara_conversations(id) ON DELETE SET NULL,
  user_id uuid,
  action text NOT NULL,
  tool_name text,
  contact_id uuid,
  payload jsonb,
  result_summary text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_actions_recent ON public.zara_actions_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_actions_user ON public.zara_actions_log(user_id, occurred_at DESC);
ALTER TABLE public.zara_actions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "actions select all auth" ON public.zara_actions_log FOR SELECT TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.zara_actions_log;

-- 4) presale_projects
CREATE TABLE IF NOT EXISTS public.presale_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  developer text,
  city text,
  neighborhood text,
  building_type text CHECK (building_type IN ('condo','townhome','mixed')),
  unit_types text[],
  unit_count int,
  price_range_low int,
  price_range_high int,
  starting_psf int,
  deposit_structure text,
  completion_year int,
  completion_quarter text,
  status text NOT NULL DEFAULT 'selling' CHECK (status IN ('pre_launch','selling','sold_out','completed')),
  vip_access boolean NOT NULL DEFAULT true,
  key_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  marketing_url text,
  brochure_url text,
  hero_image_url text,
  last_synced_at timestamptz,
  last_synced_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_proj_city_status ON public.presale_projects(city, status);
CREATE INDEX IF NOT EXISTS idx_presale_proj_price ON public.presale_projects(price_range_low, price_range_high);
CREATE INDEX IF NOT EXISTS idx_presale_proj_completion ON public.presale_projects(completion_year);
ALTER TABLE public.presale_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presale_proj read auth" ON public.presale_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "presale_proj write auth" ON public.presale_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5) zara_training_feedback
CREATE TABLE IF NOT EXISTS public.zara_training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid,
  message_id uuid,
  contact_id uuid,
  decision text NOT NULL CHECK (decision IN ('good','bad','correction')),
  notes text,
  applied_to_prompt boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_feedback_recent ON public.zara_training_feedback(created_at DESC);
ALTER TABLE public.zara_training_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback select auth" ON public.zara_training_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedback insert auth" ON public.zara_training_feedback FOR INSERT TO authenticated WITH CHECK (true);

-- 6) zara_prompt_evolution
CREATE TABLE IF NOT EXISTS public.zara_prompt_evolution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  suggestion text NOT NULL,
  example_feedback_ids uuid[],
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','applied','rejected')),
  applied_at timestamptz,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zara_prompt_evolution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evo select auth" ON public.zara_prompt_evolution FOR SELECT TO authenticated USING (true);
CREATE POLICY "evo update auth" ON public.zara_prompt_evolution FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 7) zara_system_prompt_addenda
CREATE TABLE IF NOT EXISTS public.zara_system_prompt_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addendum text NOT NULL,
  source_evolution_id uuid REFERENCES public.zara_prompt_evolution(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_addenda_active ON public.zara_system_prompt_addenda(active, created_at);
ALTER TABLE public.zara_system_prompt_addenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addenda select auth" ON public.zara_system_prompt_addenda FOR SELECT TO authenticated USING (true);
CREATE POLICY "addenda insert auth" ON public.zara_system_prompt_addenda FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "addenda update auth" ON public.zara_system_prompt_addenda FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 8) zara_research_cache
CREATE TABLE IF NOT EXISTS public.zara_research_cache (
  query_hash text PRIMARY KEY,
  query_text text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_research_recent ON public.zara_research_cache(created_at DESC);
ALTER TABLE public.zara_research_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research read auth" ON public.zara_research_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "research write auth" ON public.zara_research_cache FOR INSERT TO authenticated WITH CHECK (true);
