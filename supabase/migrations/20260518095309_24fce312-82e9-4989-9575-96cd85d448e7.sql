
-- =========================================================
-- Train Zara — internal training system tables
-- All tables are admin-only. Never expose to public client.
-- =========================================================

-- 1. Training sessions
CREATE TABLE IF NOT EXISTS public.zara_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Training session',
  scenario_kind text,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zts_owner_recent ON public.zara_training_sessions(owner_user_id, last_message_at DESC);

ALTER TABLE public.zara_training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY zts_admin_all ON public.zara_training_sessions
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Training messages
CREATE TABLE IF NOT EXISTS public.zara_training_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.zara_training_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  scenario_kind text,
  feedback_kind text,        -- e.g. 'sounds_like_uzair', 'too_robotic', etc.
  feedback_note text,
  ask_uzair boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ztm_session_time ON public.zara_training_messages(session_id, created_at);

ALTER TABLE public.zara_training_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ztm_admin_all ON public.zara_training_messages
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Bump parent session counters
CREATE OR REPLACE FUNCTION public.zara_training_messages_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.zara_training_sessions
     SET message_count = message_count + 1,
         last_message_at = now()
   WHERE id = NEW.session_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ztm_bump ON public.zara_training_messages;
CREATE TRIGGER trg_ztm_bump AFTER INSERT ON public.zara_training_messages
FOR EACH ROW EXECUTE FUNCTION public.zara_training_messages_bump();

-- 3. Style rules
CREATE TABLE IF NOT EXISTS public.zara_style_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'preferred_wording','tone','sales_logic','objection_handling',
    'booking_strategy','escalation','use_phrase','avoid_phrase'
  )),
  rule text NOT NULL,
  rationale text,
  source_message_id uuid REFERENCES public.zara_training_messages(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zsr_active_kind ON public.zara_style_rules(active, kind);

ALTER TABLE public.zara_style_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY zsr_admin_all ON public.zara_style_rules
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Winning responses (short snippets, distinct from full zara_winning_conversations threads)
CREATE TABLE IF NOT EXISTS public.zara_winning_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_kind text,
  lead_situation text NOT NULL,
  response_text text NOT NULL,
  why_it_works text,
  channel text CHECK (channel IN ('sms','email','whatsapp','call_script') OR channel IS NULL),
  tags text[] NOT NULL DEFAULT '{}',
  source_message_id uuid REFERENCES public.zara_training_messages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zwr_scenario ON public.zara_winning_responses(scenario_kind);

ALTER TABLE public.zara_winning_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY zwr_admin_all ON public.zara_winning_responses
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5. Bad responses
CREATE TABLE IF NOT EXISTS public.zara_bad_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_kind text,
  response_text text NOT NULL,
  reason text,
  tags text[] NOT NULL DEFAULT '{}',
  source_message_id uuid REFERENCES public.zara_training_messages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zbr_scenario ON public.zara_bad_responses(scenario_kind);

ALTER TABLE public.zara_bad_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY zbr_admin_all ON public.zara_bad_responses
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 6. Objection patterns
CREATE TABLE IF NOT EXISTS public.zara_objection_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_kind text NOT NULL,
  trigger_text text NOT NULL,
  suggested_reframe text NOT NULL,
  escalate_to_uzair boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zop_active ON public.zara_objection_patterns(active, objection_kind);

ALTER TABLE public.zara_objection_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY zop_admin_all ON public.zara_objection_patterns
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. Escalation rules
CREATE TABLE IF NOT EXISTS public.zara_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_kind text NOT NULL,
  condition_text text NOT NULL,
  action text NOT NULL CHECK (action IN ('escalate_to_uzair','ask_uzair','zara_handles')),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zer_active ON public.zara_escalation_rules(active, trigger_kind);

ALTER TABLE public.zara_escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY zer_admin_all ON public.zara_escalation_rules
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 8. Prompt updates queue (admin-approved before going live)
CREATE TABLE IF NOT EXISTS public.zara_prompt_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('addendum','rule_change','ask_uzair')),
  proposal text NOT NULL,
  rationale text,
  source_session_id uuid REFERENCES public.zara_training_sessions(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.zara_training_messages(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived')),
  applied_to_addendum_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zpu_status ON public.zara_prompt_updates(status, created_at DESC);

ALTER TABLE public.zara_prompt_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY zpu_admin_all ON public.zara_prompt_updates
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
