ALTER TABLE public.crm_zara_settings
  ADD COLUMN IF NOT EXISTS outbound_planner_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cold_nudge_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS max_drafts_per_lead_per_week int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_workspace_pending int NOT NULL DEFAULT 50;

CREATE TABLE IF NOT EXISTS public.crm_zara_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('cold_nudge','new_lead_welcome','presale_burst','post_showing','manual')),
  subject text,
  body text NOT NULL,
  reasoning text,
  confidence numeric(3,2),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','sent','rejected','snoozed','expired','failed')),
  reject_reason text,
  source_event jsonb DEFAULT '{}'::jsonb,
  send_meta jsonb DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zara_drafts_status_created ON public.crm_zara_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_drafts_contact ON public.crm_zara_drafts(contact_id);
CREATE INDEX IF NOT EXISTS idx_zara_drafts_scheduled ON public.crm_zara_drafts(scheduled_for) WHERE status IN ('pending','snoozed');

CREATE OR REPLACE FUNCTION public.tg_crm_zara_drafts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_crm_zara_drafts_touch ON public.crm_zara_drafts;
CREATE TRIGGER trg_crm_zara_drafts_touch
  BEFORE UPDATE ON public.crm_zara_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_zara_drafts_touch();

ALTER TABLE public.crm_zara_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zara_drafts_select ON public.crm_zara_drafts;
CREATE POLICY zara_drafts_select ON public.crm_zara_drafts
  FOR SELECT TO authenticated
  USING (public.crm_can_see_contact_id(auth.uid(), contact_id));

DROP POLICY IF EXISTS zara_drafts_update ON public.crm_zara_drafts;
CREATE POLICY zara_drafts_update ON public.crm_zara_drafts
  FOR UPDATE TO authenticated
  USING (public.crm_can_see_contact_id(auth.uid(), contact_id))
  WITH CHECK (public.crm_can_see_contact_id(auth.uid(), contact_id));

CREATE OR REPLACE FUNCTION public.crm_zara_pending_drafts_count()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.crm_zara_drafts WHERE status = 'pending';
$$;

REVOKE ALL ON FUNCTION public.crm_zara_pending_drafts_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_zara_pending_drafts_count() TO authenticated, service_role;