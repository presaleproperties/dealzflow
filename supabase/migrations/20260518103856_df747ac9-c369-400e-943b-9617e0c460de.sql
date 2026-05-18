-- 1. Layer 8 separation: public_web vs internal_crm prompts
ALTER TABLE public.zara_system_prompts
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'internal_crm';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zara_system_prompts_surface_check'
  ) THEN
    ALTER TABLE public.zara_system_prompts
      ADD CONSTRAINT zara_system_prompts_surface_check
      CHECK (surface IN ('internal_crm','public_web'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_zara_system_prompts_active_surface
  ON public.zara_system_prompts (surface, is_active) WHERE is_active = true;

-- 2. Layer 1 single source of truth — deactivate any legacy addenda
UPDATE public.zara_system_prompt_addenda SET active = false WHERE active = true;

-- 3. Layer 9 never_quote seed (data, not prompt)
UPDATE public.zara_settings
SET never_quote = jsonb_build_object(
  'topics', jsonb_build_array(
    'price','pricing','deposit','deposit_structure','completion_date',
    'availability','unit_count','incentives','assignment_terms',
    'legal_advice','mortgage_advice','tax_advice',
    'guaranteed_appreciation','guaranteed_cash_flow','rental_yield','cap_rate'
  ),
  'phrases', COALESCE(never_quote->'phrases','[]'::jsonb)
)
WHERE id = 1;

-- 4. Layered retrieval helper — single API for planner / reply / draft fns
CREATE OR REPLACE FUNCTION public.zara_retrieve_context(
  _contact_id uuid,
  _trigger text DEFAULT NULL,
  _query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playbook jsonb;
  v_principles jsonb;
  v_memory jsonb;
  v_winning jsonb;
BEGIN
  -- Layer 5: matching playbook (priority order, active)
  SELECT to_jsonb(p) INTO v_playbook
  FROM (
    SELECT id, name, description, trigger_conditions, behavior_sequence, priority
    FROM public.crm_zara_playbooks
    WHERE is_active = true
      AND (
        _trigger IS NULL
        OR trigger_conditions ? _trigger
        OR (trigger_conditions->>'trigger') = _trigger
        OR (trigger_conditions->'triggers') ? _trigger
      )
    ORDER BY priority ASC
    LIMIT 1
  ) p;

  -- Layer 2: top founder principles (by weight if present, else recent)
  SELECT COALESCE(jsonb_agg(to_jsonb(fp) ORDER BY fp.weight DESC NULLS LAST, fp.created_at DESC), '[]'::jsonb)
  INTO v_principles
  FROM (
    SELECT pr.id, pr.title, pr.body, pr.examples, pr.tags,
           COALESCE(pr.weight, 5) AS weight, pr.created_at,
           m.slug AS module_slug, m.name AS module_name
    FROM public.zara_founder_principles pr
    LEFT JOIN public.zara_founder_modules m ON m.id = pr.module_id
    ORDER BY COALESCE(pr.weight, 5) DESC NULLS LAST, pr.created_at DESC
    LIMIT 8
  ) fp;

  -- Layer 6: lead memory
  SELECT to_jsonb(lm) INTO v_memory
  FROM (
    SELECT summary, facts, signals, continuity_openers, relationship_stage,
           last_topics, last_rolled_at
    FROM public.zara_lead_memory
    WHERE contact_id = _contact_id
    LIMIT 1
  ) lm;

  -- Layer 3: top winning conversation snippets (recent, optionally trigger-tagged)
  SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC), '[]'::jsonb)
  INTO v_winning
  FROM (
    SELECT id, lead_profile, project_type, initial_situation,
           turning_message, why_it_worked, outcome, tags
    FROM public.zara_winning_conversations
    WHERE _trigger IS NULL OR _trigger = ANY(tags)
    ORDER BY created_at DESC
    LIMIT 3
  ) w;

  RETURN jsonb_build_object(
    'playbook', v_playbook,
    'principles', v_principles,
    'memory', v_memory,
    'winning', v_winning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.zara_retrieve_context(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.zara_retrieve_context(uuid, text, text) TO authenticated, service_role;