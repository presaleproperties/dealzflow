-- Per-note extracted intelligence
CREATE TABLE IF NOT EXISTS public.zara_note_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL UNIQUE REFERENCES public.crm_notes(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  emotional_state text,
  trust_level smallint,
  buying_readiness smallint,
  investor_vs_enduser text,
  objections text[] DEFAULT '{}'::text[],
  motivations text[] DEFAULT '{}'::text[],
  family_context text,
  timing_signals text[] DEFAULT '{}'::text[],
  preferred_areas text[] DEFAULT '{}'::text[],
  financial_concerns text[] DEFAULT '{}'::text[],
  commitment_level text,
  escalation_signals text[] DEFAULT '{}'::text[],
  key_quote text,
  recommended_style text,
  recommended_next_step text,
  priority_delta smallint DEFAULT 0,
  summary text,
  model text,
  raw jsonb DEFAULT '{}'::jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zara_note_intel_contact
  ON public.zara_note_intelligence(contact_id, analyzed_at DESC);

ALTER TABLE public.zara_note_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zara_note_intel_read" ON public.zara_note_intelligence;
CREATE POLICY "zara_note_intel_read"
  ON public.zara_note_intelligence
  FOR SELECT
  TO authenticated
  USING (public.crm_can_see_contact_id(auth.uid(), contact_id));

-- Service role writes only (edge functions). No insert/update/delete policies.

-- Extend the lead memory with intelligence rollup fields
ALTER TABLE public.zara_lead_memory
  ADD COLUMN IF NOT EXISTS intelligence_summary text,
  ADD COLUMN IF NOT EXISTS recommended_style text,
  ADD COLUMN IF NOT EXISTS recommended_next_step text,
  ADD COLUMN IF NOT EXISTS intelligence_priority smallint,
  ADD COLUMN IF NOT EXISTS intelligence_refreshed_at timestamptz;
