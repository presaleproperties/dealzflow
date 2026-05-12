
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sender_signature_html text;

UPDATE public.crm_team
SET slug = 'zara',
    email = 'zara@presaleproperties.com',
    role = 'agent',
    is_active = true,
    is_ai = true
WHERE id = 'e8d34039-c314-4220-a840-9909a45d2f08';

CREATE TABLE IF NOT EXISTS public.crm_zara_settings (
  id int PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT '20:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'America/Vancouver',
  daily_send_cap_per_lead int NOT NULL DEFAULT 1,
  weekly_send_cap_per_lead int NOT NULL DEFAULT 5,
  workspace_daily_cap int NOT NULL DEFAULT 200,
  model_classify text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  model_draft text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  system_prompt_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO public.crm_zara_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_zara_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read zara settings" ON public.crm_zara_settings;
CREATE POLICY "Admins can read zara settings"
  ON public.crm_zara_settings FOR SELECT TO authenticated
  USING (public.is_crm_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins can update zara settings" ON public.crm_zara_settings;
CREATE POLICY "Admins can update zara settings"
  ON public.crm_zara_settings FOR UPDATE TO authenticated
  USING (public.is_crm_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_crm_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.zara_can_send_to(_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zara_id uuid;
  v_assigned uuid;
  v_tags text[];
  v_enabled boolean;
  v_qstart time;
  v_qend time;
  v_tz text;
  v_now time;
  v_in_quiet boolean;
BEGIN
  SELECT id INTO v_zara_id FROM public.crm_team WHERE slug = 'zara' LIMIT 1;
  IF v_zara_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'zara_not_found');
  END IF;

  SELECT enabled, quiet_hours_start, quiet_hours_end, timezone
    INTO v_enabled, v_qstart, v_qend, v_tz
  FROM public.crm_zara_settings WHERE id = 1;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'kill_switch_off');
  END IF;

  SELECT assigned_to, tags INTO v_assigned, v_tags
  FROM public.crm_contacts WHERE id = _contact_id;

  IF v_assigned IS NULL OR v_assigned <> v_zara_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_assigned_to_zara');
  END IF;

  IF v_tags IS NOT NULL AND 'zara:muted' = ANY(v_tags) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'contact_muted');
  END IF;

  v_now := (now() AT TIME ZONE COALESCE(v_tz, 'America/Vancouver'))::time;
  IF v_qstart > v_qend THEN
    v_in_quiet := (v_now >= v_qstart OR v_now < v_qend);
  ELSE
    v_in_quiet := (v_now >= v_qstart AND v_now < v_qend);
  END IF;

  IF v_in_quiet THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quiet_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'zara_id', v_zara_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.zara_can_send_to(uuid) TO authenticated, anon, service_role;
