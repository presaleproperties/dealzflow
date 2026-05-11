-- Template version history (email + sms)
CREATE TABLE IF NOT EXISTS public.crm_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('email', 'sms')),
  version integer NOT NULL,
  name text,
  subject text,
  body text,
  category text,
  preview_text text,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_crm_template_versions_lookup
  ON public.crm_template_versions (template_id, kind, version DESC);

ALTER TABLE public.crm_template_versions ENABLE ROW LEVEL SECURITY;

-- Visible whenever the underlying template is visible to the caller (RLS on parent tables filters)
CREATE POLICY "Versions visible when template visible"
  ON public.crm_template_versions
  FOR SELECT
  TO authenticated
  USING (
    (kind = 'email' AND EXISTS (SELECT 1 FROM public.crm_email_templates t WHERE t.id = template_id))
    OR
    (kind = 'sms' AND EXISTS (SELECT 1 FROM public.crm_sms_templates t WHERE t.id = template_id))
  );

-- No direct insert/update/delete: managed by triggers / definer functions.

-- Snapshot trigger for email templates
CREATE OR REPLACE FUNCTION public.crm_snapshot_email_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
  v_email text;
BEGIN
  -- Only snapshot when meaningful content changed
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.name,'') IS DISTINCT FROM COALESCE(NEW.name,'')
    OR COALESCE(OLD.subject,'') IS DISTINCT FROM COALESCE(NEW.subject,'')
    OR COALESCE(OLD.body_html,'') IS DISTINCT FROM COALESCE(NEW.body_html,'')
    OR COALESCE(OLD.preview_text,'') IS DISTINCT FROM COALESCE(NEW.preview_text,'')
    OR COALESCE(OLD.category,'') IS DISTINCT FROM COALESCE(NEW.category,'')
  ) THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
      FROM public.crm_template_versions
      WHERE template_id = OLD.id AND kind = 'email';

    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN v_email := NULL;
    END;

    INSERT INTO public.crm_template_versions
      (template_id, kind, version, name, subject, body, category, preview_text, changed_by, changed_by_email)
    VALUES
      (OLD.id, 'email', v_next, OLD.name, OLD.subject, OLD.body_html, OLD.category, OLD.preview_text, auth.uid(), v_email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_email_templates_snapshot_version ON public.crm_email_templates;
CREATE TRIGGER crm_email_templates_snapshot_version
  BEFORE UPDATE ON public.crm_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_snapshot_email_template_version();

-- Snapshot trigger for SMS templates
CREATE OR REPLACE FUNCTION public.crm_snapshot_sms_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
  v_email text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.name,'') IS DISTINCT FROM COALESCE(NEW.name,'')
    OR COALESCE(OLD.body,'') IS DISTINCT FROM COALESCE(NEW.body,'')
    OR COALESCE(OLD.category,'') IS DISTINCT FROM COALESCE(NEW.category,'')
  ) THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
      FROM public.crm_template_versions
      WHERE template_id = OLD.id AND kind = 'sms';

    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN v_email := NULL;
    END;

    INSERT INTO public.crm_template_versions
      (template_id, kind, version, name, body, category, changed_by, changed_by_email)
    VALUES
      (OLD.id, 'sms', v_next, OLD.name, OLD.body, OLD.category, auth.uid(), v_email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_sms_templates_snapshot_version ON public.crm_sms_templates;
CREATE TRIGGER crm_sms_templates_snapshot_version
  BEFORE UPDATE ON public.crm_sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_snapshot_sms_template_version();

-- Revert RPC: snapshot current state, then restore version
CREATE OR REPLACE FUNCTION public.crm_revert_template_version(
  _template_id uuid,
  _kind text,
  _version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v public.crm_template_versions%ROWTYPE;
BEGIN
  SELECT * INTO v
    FROM public.crm_template_versions
    WHERE template_id = _template_id AND kind = _kind AND version = _version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  IF _kind = 'email' THEN
    UPDATE public.crm_email_templates
       SET name = COALESCE(v.name, name),
           subject = COALESCE(v.subject, subject),
           body_html = v.body,
           preview_text = v.preview_text,
           category = COALESCE(v.category, category),
           updated_at = now()
     WHERE id = _template_id;
  ELSIF _kind = 'sms' THEN
    UPDATE public.crm_sms_templates
       SET name = COALESCE(v.name, name),
           body = v.body,
           category = COALESCE(v.category, category),
           updated_at = now()
     WHERE id = _template_id;
  ELSE
    RAISE EXCEPTION 'Invalid kind';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_revert_template_version(uuid, text, integer) TO authenticated;