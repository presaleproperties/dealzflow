
CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  subject text,
  preview_text text,
  html_content text NOT NULL DEFAULT '',
  category text,
  project_tags text[] DEFAULT '{}',
  area_tags text[] DEFAULT '{}',
  detected_variables text[] DEFAULT '{}',
  change_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_etv_template ON public.email_template_versions (template_id, version_number DESC);

ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm members read template versions" ON public.email_template_versions;
CREATE POLICY "crm members read template versions"
  ON public.email_template_versions FOR SELECT
  USING (is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "crm agents+ insert template versions" ON public.email_template_versions;
CREATE POLICY "crm agents+ insert template versions"
  ON public.email_template_versions FOR INSERT
  WITH CHECK (is_crm_agent_or_above(auth.uid()));

DROP POLICY IF EXISTS "crm admins delete template versions" ON public.email_template_versions;
CREATE POLICY "crm admins delete template versions"
  ON public.email_template_versions FOR DELETE
  USING (is_crm_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.snapshot_email_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_v integer;
  vars text[];
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF NEW.html_content IS NOT DISTINCT FROM OLD.html_content
       AND NEW.subject IS NOT DISTINCT FROM OLD.subject
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.preview_text IS NOT DISTINCT FROM OLD.preview_text THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_v
    FROM public.email_template_versions
   WHERE template_id = NEW.id;

  SELECT COALESCE(array_agg(DISTINCT m[1]), '{}')
    INTO vars
    FROM regexp_matches(COALESCE(NEW.html_content,'') || ' ' || COALESCE(NEW.subject,''),
                        '\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}', 'g') AS m;

  INSERT INTO public.email_template_versions (
    template_id, version_number, name, subject, preview_text,
    html_content, category, project_tags, area_tags, detected_variables, created_by
  ) VALUES (
    NEW.id, next_v, NEW.name, NEW.subject, NEW.preview_text,
    COALESCE(NEW.html_content, ''), NEW.category,
    COALESCE(NEW.project_tags, '{}'),
    COALESCE(NEW.area_tags, '{}'),
    vars,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_email_template_version_ins ON public.email_templates;
CREATE TRIGGER trg_snapshot_email_template_version_ins
AFTER INSERT ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.snapshot_email_template_version();

DROP TRIGGER IF EXISTS trg_snapshot_email_template_version_upd ON public.email_templates;
CREATE TRIGGER trg_snapshot_email_template_version_upd
AFTER UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.snapshot_email_template_version();

INSERT INTO public.email_template_versions (
  template_id, version_number, name, subject, preview_text,
  html_content, category, project_tags, area_tags, detected_variables, created_at
)
SELECT t.id, 1, t.name, t.subject, t.preview_text,
       COALESCE(t.html_content, ''), t.category,
       COALESCE(t.project_tags, '{}'),
       COALESCE(t.area_tags, '{}'),
       COALESCE(
         (SELECT array_agg(DISTINCT m[1])
            FROM regexp_matches(COALESCE(t.html_content,'') || ' ' || COALESCE(t.subject,''),
                                '\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}', 'g') AS m),
         '{}'),
       t.updated_at
  FROM public.email_templates t
  LEFT JOIN public.email_template_versions v ON v.template_id = t.id
 WHERE v.id IS NULL;
