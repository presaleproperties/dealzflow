
CREATE TABLE IF NOT EXISTS public.crm_zara_trigger_map (
  trigger_kind text PRIMARY KEY,
  preferred_template_slug text,
  fallback_template_slug text,
  ab_subjects text[] NOT NULL DEFAULT '{}'::text[],
  preferred_hour_start smallint,
  preferred_hour_end smallint,
  preferred_tz text NOT NULL DEFAULT 'America/Vancouver',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_zara_trigger_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zara_trigger_map_admin_read"
  ON public.crm_zara_trigger_map FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "zara_trigger_map_admin_write"
  ON public.crm_zara_trigger_map FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_zara_trigger_map_updated_at
  BEFORE UPDATE ON public.crm_zara_trigger_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.crm_zara_trigger_map (trigger_kind, preferred_template_slug, description, preferred_hour_start, preferred_hour_end)
VALUES
  ('project-showcase',   'project-showcase-zara', 'One-click curated projects send (zara-send-project-details).', 9, 19),
  ('first-touch',        'first-touch',           'Initial outreach to a new lead.', 9, 19),
  ('nurture-7d',         'nurture-7d',            '7-day nurture cadence.', 10, 18),
  ('re-engage-30d',      're-engage-30d',         '30-day re-engagement.', 10, 17),
  ('follow-up',          'follow-up',             'Generic follow-up after activity.', 9, 19),
  ('after-showing',      'after-showing',         'Post-showing follow-up.', 9, 19)
ON CONFLICT (trigger_kind) DO NOTHING;

ALTER TABLE public.crm_email_schedule
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

CREATE INDEX IF NOT EXISTS idx_crm_email_schedule_needs_review
  ON public.crm_email_schedule (needs_review)
  WHERE needs_review = true;
