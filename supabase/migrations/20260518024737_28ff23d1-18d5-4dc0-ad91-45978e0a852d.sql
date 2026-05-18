
ALTER TABLE public.zara_settings
  ADD COLUMN IF NOT EXISTS kill_switch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_reason text,
  ADD COLUMN IF NOT EXISTS kill_switch_at timestamptz,
  ADD COLUMN IF NOT EXISTS kill_switch_by uuid,
  ADD COLUMN IF NOT EXISTS never_quote jsonb NOT NULL DEFAULT '{"phrases":[],"topics":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS standup_hour_local int NOT NULL DEFAULT 7;

ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS zara_autonomy_override int,
  ADD COLUMN IF NOT EXISTS zara_quiet_hours jsonb;

ALTER TABLE public.crm_team
  DROP CONSTRAINT IF EXISTS crm_team_zara_autonomy_override_check;
ALTER TABLE public.crm_team
  ADD CONSTRAINT crm_team_zara_autonomy_override_check
  CHECK (zara_autonomy_override IS NULL OR (zara_autonomy_override BETWEEN 1 AND 5));

CREATE TABLE IF NOT EXISTS public.zara_handoff_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  from_agent_user_id uuid,
  to_agent_user_id uuid,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_handoff_to_agent ON public.zara_handoff_briefs(to_agent_user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_zara_handoff_contact ON public.zara_handoff_briefs(contact_id);
ALTER TABLE public.zara_handoff_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents see their handoffs" ON public.zara_handoff_briefs;
CREATE POLICY "agents see their handoffs"
  ON public.zara_handoff_briefs FOR SELECT TO authenticated
  USING (
    to_agent_user_id = auth.uid()
    OR from_agent_user_id = auth.uid()
    OR public.is_crm_admin_or_owner(auth.uid())
  );

DROP POLICY IF EXISTS "recipient can mark read" ON public.zara_handoff_briefs;
CREATE POLICY "recipient can mark read"
  ON public.zara_handoff_briefs FOR UPDATE TO authenticated
  USING (to_agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()))
  WITH CHECK (to_agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()));

CREATE TABLE IF NOT EXISTS public.zara_proactive_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily_standup','risk_scan','weekly_review','return_visit')),
  agent_user_id uuid,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zara_nudges_dedupe ON public.zara_proactive_nudges(kind, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_zara_nudges_agent ON public.zara_proactive_nudges(agent_user_id, resolved_at, created_at DESC);
ALTER TABLE public.zara_proactive_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents see their nudges" ON public.zara_proactive_nudges;
CREATE POLICY "agents see their nudges"
  ON public.zara_proactive_nudges FOR SELECT TO authenticated
  USING (
    agent_user_id = auth.uid()
    OR public.is_crm_admin_or_owner(auth.uid())
    OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
  );

DROP POLICY IF EXISTS "agents resolve their nudges" ON public.zara_proactive_nudges;
CREATE POLICY "agents resolve their nudges"
  ON public.zara_proactive_nudges FOR UPDATE TO authenticated
  USING (agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()))
  WITH CHECK (agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.zara_effective_autonomy(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT zara_autonomy_override FROM public.crm_team WHERE user_id = _user_id AND is_active LIMIT 1),
    (SELECT autonomy_level FROM public.zara_settings WHERE id = 1),
    3
  );
$$;

CREATE OR REPLACE FUNCTION public.zara_handoff_on_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from_uid uuid;
  v_to_uid uuid;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    SELECT user_id INTO v_from_uid FROM public.crm_team WHERE id = OLD.assigned_to LIMIT 1;
    SELECT user_id INTO v_to_uid FROM public.crm_team WHERE id = NEW.assigned_to LIMIT 1;
    INSERT INTO public.zara_handoff_briefs (contact_id, from_agent_user_id, to_agent_user_id, summary, brief)
    VALUES (NEW.id, v_from_uid, v_to_uid, 'Reassigned — Zara briefing pending', '{"pending":true}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zara_handoff_on_assignment ON public.crm_contacts;
CREATE TRIGGER trg_zara_handoff_on_assignment
  AFTER UPDATE OF assigned_to ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.zara_handoff_on_assignment();
