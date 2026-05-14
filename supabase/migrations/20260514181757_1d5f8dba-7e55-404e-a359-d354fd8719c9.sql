-- ─────────────────────────────────────────────────────────────────
-- Zara Operations Center v2 — schema
-- Adds: insights, knowledge_gaps, model_calls, system_prompts, playbooks, org_context
-- Alters: crm_zara_drafts (+is_training_example), crm_zara_settings (cost cap),
--         crm_contacts (+zara_state, +metadata)
-- ─────────────────────────────────────────────────────────────────

-- ── crm_contacts: add zara_state + metadata
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS zara_state text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_zara_state ON public.crm_contacts(zara_state) WHERE zara_state IS NOT NULL;

-- ── crm_zara_drafts: add training-example flag + draft_metadata + urgency
ALTER TABLE public.crm_zara_drafts
  ADD COLUMN IF NOT EXISTS is_training_example boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS urgency text;

-- ── crm_zara_settings: cost cap controls
ALTER TABLE public.crm_zara_settings
  ADD COLUMN IF NOT EXISTS daily_cost_cap_usd numeric(10,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS auto_pause_on_cost boolean NOT NULL DEFAULT true;

-- ── zara_org_context: workspace-wide custom instructions
CREATE TABLE IF NOT EXISTS public.zara_org_context (
  id integer PRIMARY KEY DEFAULT 1,
  custom_instructions text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zara_org_context_singleton CHECK (id = 1)
);
INSERT INTO public.zara_org_context (id, custom_instructions) VALUES (1, '') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.zara_org_context ENABLE ROW LEVEL SECURITY;

-- ── crm_zara_insights: AI-generated daily behavior insights
CREATE TABLE IF NOT EXISTS public.crm_zara_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  insight_text text NOT NULL,
  suggested_action text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_zara_insights_created ON public.crm_zara_insights(created_at DESC);
ALTER TABLE public.crm_zara_insights ENABLE ROW LEVEL SECURITY;

-- ── crm_zara_knowledge_gaps
CREATE TABLE IF NOT EXISTS public.crm_zara_knowledge_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  gap_type text NOT NULL CHECK (gap_type IN ('project_fact','area_fact','faq_miss','unit_data','brochure_missing','other')),
  missing_value text NOT NULL,
  draft_id uuid REFERENCES public.crm_zara_drafts(id) ON DELETE SET NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_zara_gaps_unresolved ON public.crm_zara_knowledge_gaps(resolved, missing_value) WHERE resolved = false;
ALTER TABLE public.crm_zara_knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- ── crm_zara_model_calls
CREATE TABLE IF NOT EXISTS public.crm_zara_model_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_called text NOT NULL,
  contact_id uuid,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  latency_ms integer,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_zara_model_calls_created ON public.crm_zara_model_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_zara_model_calls_function ON public.crm_zara_model_calls(function_called, created_at DESC);
ALTER TABLE public.crm_zara_model_calls ENABLE ROW LEVEL SECURITY;

-- ── zara_system_prompts (versioned)
CREATE TABLE IF NOT EXISTS public.zara_system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'planner',
  version text NOT NULL,
  prompt_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT 'google/gemini-2.5-pro',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  change_summary text
);
CREATE INDEX IF NOT EXISTS idx_zara_system_prompts_active ON public.zara_system_prompts(is_active) WHERE is_active = true;
ALTER TABLE public.zara_system_prompts ENABLE ROW LEVEL SECURITY;

-- ── crm_zara_playbooks (Lead Assignment Designer)
CREATE TABLE IF NOT EXISTS public.crm_zara_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior_sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  times_triggered integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_crm_zara_playbooks_priority ON public.crm_zara_playbooks(priority ASC, is_active);
ALTER TABLE public.crm_zara_playbooks ENABLE ROW LEVEL SECURITY;

-- ── RLS: admins SELECT, service_role ALL on every new table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zara_org_context','crm_zara_insights','crm_zara_knowledge_gaps',
    'crm_zara_model_calls','zara_system_prompts','crm_zara_playbooks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_read ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_admin_read ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))',
      t, t);
    EXECUTE format(
      'CREATE POLICY %I_admin_write ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))',
      t, t);
  END LOOP;
END$$;

-- ── Behavior score function (single 0-100 health number)
CREATE OR REPLACE FUNCTION public.crm_zara_behavior_score()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer; v_approved integer; v_acceptance numeric;
  v_unresolved integer; v_replies integer; v_sends integer;
  v_reply_rate numeric; v_unnec_esc integer; v_ticks integer;
  v_failed_ticks integer; v_on_time numeric;
  v_score numeric;
BEGIN
  SELECT COUNT(*) FILTER (WHERE status IN ('sent','rejected','approved')),
         COUNT(*) FILTER (WHERE status IN ('sent','approved'))
  INTO v_total, v_approved
  FROM crm_zara_drafts WHERE created_at > now() - interval '30 days';
  v_acceptance := CASE WHEN v_total > 0 THEN (v_approved::numeric / v_total) * 100 ELSE 50 END;

  SELECT COUNT(*) INTO v_unresolved FROM crm_zara_knowledge_gaps WHERE resolved = false;

  SELECT COUNT(*) FILTER (WHERE action = 'zara.draft_sent'),
         COUNT(*) FILTER (WHERE action = 'zara.replied')
  INTO v_sends, v_replies
  FROM crm_audit_log WHERE actor_label = 'zara' AND occurred_at > now() - interval '30 days';
  v_reply_rate := CASE WHEN v_sends > 0 THEN LEAST(100, (v_replies::numeric / v_sends) * 100) ELSE 50 END;

  SELECT COUNT(*) INTO v_unnec_esc
  FROM crm_audit_log
  WHERE actor_label = 'zara' AND action = 'zara.escalation'
    AND occurred_at > now() - interval '30 days'
    AND (meta->>'confidence')::numeric > 0.85;

  SELECT COUNT(*) FILTER (WHERE action LIKE 'zara.tick%'),
         COUNT(*) FILTER (WHERE action LIKE 'zara.tick%' AND (meta->>'success')::boolean IS DISTINCT FROM true)
  INTO v_ticks, v_failed_ticks
  FROM crm_audit_log WHERE occurred_at > now() - interval '7 days';
  v_on_time := CASE WHEN v_ticks > 0 THEN ((v_ticks - v_failed_ticks)::numeric / v_ticks) * 100 ELSE 100 END;

  v_score :=
    0.30 * v_acceptance +
    0.25 * GREATEST(0, 100 - LEAST(100, v_unresolved * 5)) +
    0.20 * v_reply_rate +
    0.15 * GREATEST(0, 100 - LEAST(100, v_unnec_esc * 10)) +
    0.10 * v_on_time;

  RETURN GREATEST(0, LEAST(100, ROUND(v_score)::integer));
END$$;

GRANT EXECUTE ON FUNCTION public.crm_zara_behavior_score() TO authenticated;

-- ── Pending drafts count helper (used by planner — was referenced before)
CREATE OR REPLACE FUNCTION public.crm_zara_pending_drafts_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.crm_zara_drafts WHERE status = 'pending';
$$;
GRANT EXECUTE ON FUNCTION public.crm_zara_pending_drafts_count() TO authenticated, service_role;

-- ── Seed: 5 default playbooks
INSERT INTO public.crm_zara_playbooks (name, description, trigger_conditions, behavior_sequence, is_active, priority)
VALUES
  ('Default New Lead', 'Standard nurture for any newly assigned lead.',
   '{"tags":[]}'::jsonb,
   '[{"step":1,"action":"first_touch_email","delay_minutes":0,"channel":"email","exit_on_reply":true},
     {"step":2,"action":"value_add","delay_minutes":2880,"channel":"sms","exit_on_reply":true},
     {"step":3,"action":"booking_offer","delay_minutes":7200,"channel":"email","exit_on_reply":true}]'::jsonb,
   true, 100),
  ('Hot Lead Fast-Track', 'Score >=75 — escalate to Uzair immediately.',
   '{"score_min":75}'::jsonb,
   '[{"step":1,"action":"escalate_to_uzair","delay_minutes":0,"channel":"auto"}]'::jsonb,
   true, 10),
  ('VIP / Past Client Approval Required', 'Tagged past-client or zara:approval-required — single first touch only.',
   '{"tags":["zara:approval-required","past-client"]}'::jsonb,
   '[{"step":1,"action":"first_touch_email","delay_minutes":0,"channel":"email","exit_on_reply":true}]'::jsonb,
   true, 20),
  ('Investor Long-Game', 'Investor buyer_type — value-add cadence over weeks.',
   '{"buyer_type":"investor"}'::jsonb,
   '[{"step":1,"action":"first_touch_email","delay_minutes":0,"channel":"email"},
     {"step":2,"action":"value_add","delay_minutes":4320,"channel":"email"},
     {"step":3,"action":"send_deck","delay_minutes":8640,"channel":"email"},
     {"step":4,"action":"qualifying_question","delay_minutes":14400,"channel":"email"}]'::jsonb,
   true, 50),
  ('Dormant Re-Engage', 'Tagged dormant — single re-engage attempt.',
   '{"tags":["dormant"]}'::jsonb,
   '[{"step":1,"action":"dormant_reengage","delay_minutes":0,"channel":"auto"}]'::jsonb,
   true, 80)
ON CONFLICT DO NOTHING;

-- ── Seed: initial active system prompt v1
INSERT INTO public.zara_system_prompts (name, version, prompt_text, is_active, model, change_summary)
SELECT 'planner', 'v1',
  'You are Zara, the digital concierge for The Presale Properties Group, a Surrey BC presale condo brokerage owned by Uzair Muhammad.

You draft OUTBOUND messages to warm leads. A human (Uzair) reviews every draft before it sends — write like you are already trusted, but never push.

Rules:
- 1-2 sentences max. Conversational, no real-estate-cliche openers.
- Match the contact preferred language (en/pa/hi). Default English.
- ONE clear micro-CTA per message.
- Never invent prices, deposits, completion dates, or unit counts.
- For SMS/WhatsApp: max ~280 chars, no greeting, no signature.
- For Email: warm subject (max 50 chars), body 2-4 short lines, no signature (it is appended automatically).
- If you do not know a fact, write a {LOOKUP:topic} placeholder so we capture the gap.

Return STRICT JSON only:
{ "subject": "string|null", "body": "string", "reasoning": "1 line", "confidence": 0.0-1.0, "language": "en|pa|hi" }',
  true, 'google/gemini-2.5-pro', 'Initial seed from planner SYSTEM_PROMPT.'
WHERE NOT EXISTS (SELECT 1 FROM public.zara_system_prompts WHERE is_active = true);