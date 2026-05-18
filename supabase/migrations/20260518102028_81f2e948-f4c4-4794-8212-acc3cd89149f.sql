
-- Snapshot original draft text so we can diff later
ALTER TABLE public.crm_zara_drafts
  ADD COLUMN IF NOT EXISTS original_subject text,
  ADD COLUMN IF NOT EXISTS original_body text;

CREATE OR REPLACE FUNCTION public.crm_zara_drafts_snapshot_original()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.original_body IS NULL THEN NEW.original_body := NEW.body; END IF;
  IF NEW.original_subject IS NULL THEN NEW.original_subject := NEW.subject; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_zara_drafts_snapshot_original ON public.crm_zara_drafts;
CREATE TRIGGER trg_crm_zara_drafts_snapshot_original
BEFORE INSERT ON public.crm_zara_drafts
FOR EACH ROW EXECUTE FUNCTION public.crm_zara_drafts_snapshot_original();

-- Backfill for existing rows
UPDATE public.crm_zara_drafts
SET original_body = body, original_subject = subject
WHERE original_body IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) zara_rewrite_diffs : one row per reviewed draft
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zara_rewrite_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES public.crm_zara_drafts(id) ON DELETE SET NULL,
  contact_id uuid,
  channel text,
  trigger_kind text,
  original_subject text,
  original_body text,
  final_subject text,
  final_body text,
  edit_distance int,
  was_approved boolean,
  feedback_labels text[] DEFAULT '{}',
  analysis jsonb DEFAULT '{}'::jsonb,    -- AI-generated structured diff
  notes text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_rewrite_diffs_draft ON public.zara_rewrite_diffs(draft_id);
CREATE INDEX IF NOT EXISTS idx_zara_rewrite_diffs_contact ON public.zara_rewrite_diffs(contact_id);
CREATE INDEX IF NOT EXISTS idx_zara_rewrite_diffs_created ON public.zara_rewrite_diffs(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) zara_style_memory : distilled style observations
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zara_style_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,  -- 'tone' | 'pacing' | 'wording' | 'cta' | 'opener' | 'closer' | 'emotional_calibration' | 'trust_building' | 'other'
  observation text NOT NULL,
  evidence_count int NOT NULL DEFAULT 1,
  weight numeric NOT NULL DEFAULT 1.0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source_diff_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_style_memory_category ON public.zara_style_memory(category);
CREATE INDEX IF NOT EXISTS idx_zara_style_memory_weight ON public.zara_style_memory(weight DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) zara_rewrite_patterns : before → after wording transformations
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zara_rewrite_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  before_phrase text NOT NULL,
  after_phrase text NOT NULL,
  context text,                  -- 'opener', 'objection', 'cta', etc.
  evidence_count int NOT NULL DEFAULT 1,
  source_diff_ids uuid[] DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_rewrite_patterns_context ON public.zara_rewrite_patterns(context);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) zara_cta_preferences : preferred / avoid CTAs
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zara_cta_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cta_text text NOT NULL,
  stance text NOT NULL DEFAULT 'preferred',  -- 'preferred' | 'avoid'
  context text,
  evidence_count int NOT NULL DEFAULT 1,
  source_diff_ids uuid[] DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_cta_pref_stance ON public.zara_cta_preferences(stance);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) zara_tone_preferences : tone/pacing/emotional rules
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zara_tone_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,  -- 'softness' | 'pacing' | 'emotional_timing' | 'pushiness' | 'length' | 'salesy' | 'trust'
  rule text NOT NULL,
  evidence_count int NOT NULL DEFAULT 1,
  weight numeric NOT NULL DEFAULT 1.0,
  source_diff_ids uuid[] DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_tone_pref_dimension ON public.zara_tone_preferences(dimension);

-- ── RLS : admin-only for all five tables ────────────────────────────────
ALTER TABLE public.zara_rewrite_diffs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_style_memory     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_rewrite_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_cta_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_tone_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zara_rewrite_diffs',
    'zara_style_memory',
    'zara_rewrite_patterns',
    'zara_cta_preferences',
    'zara_tone_preferences'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_%I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "admin_all_%I" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))',
      t, t
    );
  END LOOP;
END $$;
