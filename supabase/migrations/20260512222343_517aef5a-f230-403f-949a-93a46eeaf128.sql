-- Workspace-wide CRM team settings (singleton row enforced via unique partial index)
CREATE TABLE IF NOT EXISTS public.crm_team_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  data_safety_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_team_settings_singleton_idx
  ON public.crm_team_settings ((singleton)) WHERE singleton = true;

INSERT INTO public.crm_team_settings (singleton)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM public.crm_team_settings WHERE singleton = true);

ALTER TABLE public.crm_team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read team settings" ON public.crm_team_settings;
CREATE POLICY "members can read team settings"
ON public.crm_team_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid() AND t.is_active = true
  )
  OR public.is_crm_admin_or_owner(auth.uid())
);

DROP POLICY IF EXISTS "admins can update team settings" ON public.crm_team_settings;
CREATE POLICY "admins can update team settings"
ON public.crm_team_settings
FOR UPDATE
TO authenticated
USING (public.is_crm_admin_or_owner(auth.uid()))
WITH CHECK (public.is_crm_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "admins can insert team settings" ON public.crm_team_settings;
CREATE POLICY "admins can insert team settings"
ON public.crm_team_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_crm_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.crm_team_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_team_settings_touch_trg ON public.crm_team_settings;
CREATE TRIGGER crm_team_settings_touch_trg
BEFORE UPDATE ON public.crm_team_settings
FOR EACH ROW EXECUTE FUNCTION public.crm_team_settings_touch();

-- Admin-only RPC to flip a single checklist item.
CREATE OR REPLACE FUNCTION public.crm_set_data_safety_check(
  _key text,
  _checked boolean,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_label text;
  v_email text;
  v_entry jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_crm_admin_or_owner(v_uid) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  IF _key IS NULL OR length(_key) = 0 THEN
    RAISE EXCEPTION 'key required';
  END IF;

  v_label := public.crm_audit_actor_label(v_uid);
  v_email := public.crm_audit_actor_email(v_uid);

  IF _checked THEN
    v_entry := jsonb_build_object(
      'checked', true,
      'checked_at', to_jsonb(now()),
      'checked_by', to_jsonb(v_uid),
      'checked_by_label', to_jsonb(v_label),
      'checked_by_email', to_jsonb(v_email),
      'note', to_jsonb(_note)
    );
  ELSE
    v_entry := jsonb_build_object(
      'checked', false,
      'unchecked_at', to_jsonb(now()),
      'unchecked_by', to_jsonb(v_uid),
      'unchecked_by_label', to_jsonb(v_label),
      'note', to_jsonb(_note)
    );
  END IF;

  -- Ensure singleton exists
  INSERT INTO public.crm_team_settings (singleton)
  SELECT true
  WHERE NOT EXISTS (SELECT 1 FROM public.crm_team_settings WHERE singleton = true);

  UPDATE public.crm_team_settings
     SET data_safety_checklist = COALESCE(data_safety_checklist, '{}'::jsonb) || jsonb_build_object(_key, v_entry)
   WHERE singleton = true
   RETURNING data_safety_checklist INTO v_result;

  -- Audit
  PERFORM public.crm_log_bulk_op(
    'data_safety_check',
    1,
    jsonb_build_object('key', _key, 'checked', _checked),
    jsonb_build_object('entry', v_entry),
    NULL
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_set_data_safety_check(text, boolean, text) TO authenticated;