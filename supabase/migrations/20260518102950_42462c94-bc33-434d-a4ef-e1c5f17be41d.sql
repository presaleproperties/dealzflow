
-- 10 modules
CREATE TABLE public.zara_founder_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zara_founder_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_modules_admin_all" ON public.zara_founder_modules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.zara_founder_modules (slug, name, description, sort_order) VALUES
  ('communication_dna', 'Communication DNA', 'How Uzair naturally communicates — phrasing, pacing, CTAs, transitions.', 1),
  ('sales_philosophy', 'Sales Philosophy', 'Foundational beliefs about how presale buyers actually convert.', 2),
  ('buyer_psychology', 'Buyer Psychology', 'Observations about how presale buyers think, hesitate, and decide.', 3),
  ('investor_philosophy', 'Investor Philosophy', 'How Uzair evaluates investor opportunities and reasoning.', 4),
  ('relationship_strategy', 'Relationship Strategy', 'How Uzair builds trust and continuity over time.', 5),
  ('objection_handling', 'Objection Handling', 'How Uzair reframes pricing, rates, timing and developer concerns.', 6),
  ('project_evaluation', 'Project Evaluation Logic', 'How Uzair grades projects, pricing, floorplans, location.', 7),
  ('escalation_timing', 'Escalation & Timing Logic', 'When Zara should bring Uzair in.', 8),
  ('real_conversation_learning', 'Real Conversation Learning', 'Lessons distilled from real chats, DMs, emails, recoveries.', 9),
  ('founder_memory_retrieval', 'Founder Memory Retrieval', 'Rules for surfacing the right founder memory when drafting.', 10);

-- Principles
CREATE TABLE public.zara_founder_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.zara_founder_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  examples text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  weight int NOT NULL DEFAULT 5, -- 1..10
  active boolean NOT NULL DEFAULT true,
  source_kind text, -- 'manual' | 'teach_session' | 'conversation' | 'rewrite_diff'
  source_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zara_founder_principles_module_idx ON public.zara_founder_principles (module_id, active);
CREATE INDEX zara_founder_principles_tags_idx ON public.zara_founder_principles USING GIN (tags);

ALTER TABLE public.zara_founder_principles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_principles_admin_all" ON public.zara_founder_principles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_zara_founder_principles_updated
BEFORE UPDATE ON public.zara_founder_principles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Real conversation uploads
CREATE TABLE public.zara_founder_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  channel text NOT NULL, -- sms | ig_dm | fb_messenger | email | whatsapp | call_notes | other
  transcript text NOT NULL,
  outcome text, -- booked_appointment | reply_recovered | ghost_recovered | objection_handled | lost | nurture
  lead_persona text, -- investor | end_user | first_time | family | assignment | etc
  emotional_state text, -- overwhelmed | skeptical | engaged | analytical | nervous | appointment_ready | ghost
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  analyzed_at timestamptz,
  analysis jsonb, -- { progression, trust_moments, reply_triggers, momentum, lessons[] }
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zara_founder_conversations_tags_idx ON public.zara_founder_conversations USING GIN (tags);

ALTER TABLE public.zara_founder_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_conversations_admin_all" ON public.zara_founder_conversations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lessons (structured findings from teach sessions or conversation analysis)
CREATE TABLE public.zara_founder_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES public.zara_founder_modules(id) ON DELETE SET NULL,
  summary text NOT NULL,
  detail text,
  tags text[] NOT NULL DEFAULT '{}',
  source_kind text NOT NULL, -- 'teach_session' | 'conversation'
  source_id uuid,
  promoted_principle_id uuid REFERENCES public.zara_founder_principles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zara_founder_lessons_module_idx ON public.zara_founder_lessons (module_id);

ALTER TABLE public.zara_founder_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_lessons_admin_all" ON public.zara_founder_lessons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Teach Zara sessions
CREATE TABLE public.zara_founder_teach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  focus_module_id uuid REFERENCES public.zara_founder_modules(id) ON DELETE SET NULL,
  message_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zara_founder_teach_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_teach_sessions_admin_all" ON public.zara_founder_teach_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.zara_founder_teach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.zara_founder_teach_sessions(id) ON DELETE CASCADE,
  role text NOT NULL, -- user | assistant
  content text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb, -- { lessons[], clarifying_questions[], proposed_principles[] }
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zara_founder_teach_messages_session_idx ON public.zara_founder_teach_messages (session_id, created_at);
ALTER TABLE public.zara_founder_teach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "founder_teach_messages_admin_all" ON public.zara_founder_teach_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bump message_count / last_message_at on insert
CREATE OR REPLACE FUNCTION public.zara_founder_teach_msg_bump()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.zara_founder_teach_sessions
     SET message_count = message_count + 1,
         last_message_at = now()
   WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_zara_founder_teach_msg_bump
AFTER INSERT ON public.zara_founder_teach_messages
FOR EACH ROW EXECUTE FUNCTION public.zara_founder_teach_msg_bump();

-- Retrieval helper: top N relevant principles given a free-text context and optional module filter
CREATE OR REPLACE FUNCTION public.zara_founder_retrieve(
  _query text,
  _module_slug text DEFAULT NULL,
  _limit int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  module_slug text,
  module_name text,
  title text,
  body text,
  examples text[],
  tags text[],
  weight int,
  score real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, m.slug, m.name, p.title, p.body, p.examples, p.tags, p.weight,
    (
      ts_rank(
        to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.body,'') || ' ' || array_to_string(coalesce(p.tags,'{}'),' ') || ' ' || array_to_string(coalesce(p.examples,'{}'),' ')),
        plainto_tsquery('english', coalesce(_query,''))
      ) * (1.0 + p.weight::real / 10.0)
    )::real AS score
  FROM public.zara_founder_principles p
  JOIN public.zara_founder_modules m ON m.id = p.module_id
  WHERE p.active = true
    AND (_module_slug IS NULL OR m.slug = _module_slug)
    AND (
      _query IS NULL OR _query = '' OR
      to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.body,'') || ' ' || array_to_string(coalesce(p.tags,'{}'),' ') || ' ' || array_to_string(coalesce(p.examples,'{}'),' '))
      @@ plainto_tsquery('english', _query)
    )
  ORDER BY score DESC NULLS LAST, p.weight DESC, p.updated_at DESC
  LIMIT GREATEST(coalesce(_limit, 8), 1);
$$;
