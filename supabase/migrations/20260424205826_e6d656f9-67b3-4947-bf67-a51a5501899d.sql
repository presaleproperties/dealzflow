
-- ============================================================================
-- UNIFIED LIBRARIES: projects + lead_types (mirroring the existing crm_tags pattern)
-- ============================================================================

-- ---------- crm_projects library ----------
CREATE TABLE IF NOT EXISTS public.crm_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can view projects" ON public.crm_projects;
CREATE POLICY "CRM members can view projects" ON public.crm_projects
  FOR SELECT USING (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "CRM agents can insert projects" ON public.crm_projects;
CREATE POLICY "CRM agents can insert projects" ON public.crm_projects
  FOR INSERT WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

DROP POLICY IF EXISTS "CRM agents can update projects" ON public.crm_projects;
CREATE POLICY "CRM agents can update projects" ON public.crm_projects
  FOR UPDATE USING (public.is_crm_agent_or_above(auth.uid()));

DROP POLICY IF EXISTS "CRM admins can delete projects" ON public.crm_projects;
CREATE POLICY "CRM admins can delete projects" ON public.crm_projects
  FOR DELETE USING (public.is_crm_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_crm_projects_updated_at ON public.crm_projects;
CREATE TRIGGER update_crm_projects_updated_at
  BEFORE UPDATE ON public.crm_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- crm_lead_types library ----------
CREATE TABLE IF NOT EXISTS public.crm_lead_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED UNIQUE,
  label TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lead_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can view lead types" ON public.crm_lead_types;
CREATE POLICY "CRM members can view lead types" ON public.crm_lead_types
  FOR SELECT USING (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "CRM agents can insert lead types" ON public.crm_lead_types;
CREATE POLICY "CRM agents can insert lead types" ON public.crm_lead_types
  FOR INSERT WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

DROP POLICY IF EXISTS "CRM agents can update lead types" ON public.crm_lead_types;
CREATE POLICY "CRM agents can update lead types" ON public.crm_lead_types
  FOR UPDATE USING (public.is_crm_agent_or_above(auth.uid()));

DROP POLICY IF EXISTS "CRM admins can delete lead types" ON public.crm_lead_types;
CREATE POLICY "CRM admins can delete lead types" ON public.crm_lead_types
  FOR DELETE USING (public.is_crm_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_crm_lead_types_updated_at ON public.crm_lead_types;
CREATE TRIGGER update_crm_lead_types_updated_at
  BEFORE UPDATE ON public.crm_lead_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Sync function: crm_contacts.projects[] -> crm_projects (mirrors sync_crm_tags_from_contact)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_crm_projects_from_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  added text[];
  removed text[];
  t text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    added := COALESCE(NEW.projects, '{}'::text[]);
    -- Also include legacy single project field
    IF NEW.project IS NOT NULL AND length(btrim(NEW.project)) > 0
       AND NOT (added @> ARRAY[NEW.project]) THEN
      added := added || ARRAY[NEW.project];
    END IF;
    removed := '{}'::text[];
  ELSIF TG_OP = 'UPDATE' THEN
    added := COALESCE(
      ARRAY(SELECT unnest(COALESCE(NEW.projects, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(OLD.projects, '{}'::text[]))),
      '{}'::text[]
    );
    removed := COALESCE(
      ARRAY(SELECT unnest(COALESCE(OLD.projects, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(NEW.projects, '{}'::text[]))),
      '{}'::text[]
    );
    -- Track legacy single project changes too
    IF NEW.project IS DISTINCT FROM OLD.project THEN
      IF NEW.project IS NOT NULL AND length(btrim(NEW.project)) > 0 THEN
        added := added || ARRAY[NEW.project];
      END IF;
      IF OLD.project IS NOT NULL AND length(btrim(OLD.project)) > 0 THEN
        removed := removed || ARRAY[OLD.project];
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    added := '{}'::text[];
    removed := COALESCE(OLD.projects, '{}'::text[]);
    IF OLD.project IS NOT NULL AND length(btrim(OLD.project)) > 0 THEN
      removed := removed || ARRAY[OLD.project];
    END IF;
  END IF;

  IF array_length(added, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY added LOOP
      IF length(btrim(t)) > 0 THEN
        INSERT INTO public.crm_projects (name, usage_count)
        VALUES (btrim(t), 1)
        ON CONFLICT (name_lower) DO UPDATE
          SET usage_count = public.crm_projects.usage_count + 1,
              updated_at  = now();
      END IF;
    END LOOP;
  END IF;

  IF array_length(removed, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY removed LOOP
      IF length(btrim(t)) > 0 THEN
        UPDATE public.crm_projects
        SET usage_count = GREATEST(usage_count - 1, 0),
            updated_at  = now()
        WHERE name_lower = lower(btrim(t));
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_crm_projects ON public.crm_contacts;
CREATE TRIGGER trg_sync_crm_projects
  AFTER INSERT OR DELETE OR UPDATE OF projects, project ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_projects_from_contact();

-- ============================================================================
-- Sync function: crm_contacts.lead_types[] (+ legacy lead_type) -> crm_lead_types
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_crm_lead_types_from_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  added text[];
  removed text[];
  t text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    added := COALESCE(NEW.lead_types, '{}'::text[]);
    IF NEW.lead_type IS NOT NULL AND length(btrim(NEW.lead_type)) > 0
       AND NOT (added @> ARRAY[NEW.lead_type]) THEN
      added := added || ARRAY[NEW.lead_type];
    END IF;
    removed := '{}'::text[];
  ELSIF TG_OP = 'UPDATE' THEN
    added := COALESCE(
      ARRAY(SELECT unnest(COALESCE(NEW.lead_types, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(OLD.lead_types, '{}'::text[]))),
      '{}'::text[]
    );
    removed := COALESCE(
      ARRAY(SELECT unnest(COALESCE(OLD.lead_types, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(NEW.lead_types, '{}'::text[]))),
      '{}'::text[]
    );
    IF NEW.lead_type IS DISTINCT FROM OLD.lead_type THEN
      IF NEW.lead_type IS NOT NULL AND length(btrim(NEW.lead_type)) > 0 THEN
        added := added || ARRAY[NEW.lead_type];
      END IF;
      IF OLD.lead_type IS NOT NULL AND length(btrim(OLD.lead_type)) > 0 THEN
        removed := removed || ARRAY[OLD.lead_type];
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    added := '{}'::text[];
    removed := COALESCE(OLD.lead_types, '{}'::text[]);
    IF OLD.lead_type IS NOT NULL AND length(btrim(OLD.lead_type)) > 0 THEN
      removed := removed || ARRAY[OLD.lead_type];
    END IF;
  END IF;

  IF array_length(added, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY added LOOP
      IF length(btrim(t)) > 0 THEN
        INSERT INTO public.crm_lead_types (name, usage_count)
        VALUES (btrim(t), 1)
        ON CONFLICT (name_lower) DO UPDATE
          SET usage_count = public.crm_lead_types.usage_count + 1,
              updated_at  = now();
      END IF;
    END LOOP;
  END IF;

  IF array_length(removed, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY removed LOOP
      IF length(btrim(t)) > 0 THEN
        UPDATE public.crm_lead_types
        SET usage_count = GREATEST(usage_count - 1, 0),
            updated_at  = now()
        WHERE name_lower = lower(btrim(t));
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_crm_lead_types ON public.crm_contacts;
CREATE TRIGGER trg_sync_crm_lead_types
  AFTER INSERT OR DELETE OR UPDATE OF lead_types, lead_type ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_lead_types_from_contact();

-- ============================================================================
-- BACKFILL existing libraries from current contacts
-- ============================================================================

-- Projects (from both array and legacy single field)
INSERT INTO public.crm_projects (name, usage_count)
SELECT btrim(p) AS name, COUNT(*) AS usage_count
FROM (
  SELECT unnest(projects) AS p FROM public.crm_contacts WHERE projects IS NOT NULL
  UNION ALL
  SELECT project AS p FROM public.crm_contacts WHERE project IS NOT NULL AND length(btrim(project)) > 0
) src
WHERE p IS NOT NULL AND length(btrim(p)) > 0
GROUP BY lower(btrim(p)), btrim(p)
ON CONFLICT (name_lower) DO UPDATE
  SET usage_count = EXCLUDED.usage_count,
      updated_at = now();

-- Lead types (from both array and legacy single field)
INSERT INTO public.crm_lead_types (name, usage_count)
SELECT btrim(p) AS name, COUNT(*) AS usage_count
FROM (
  SELECT unnest(lead_types) AS p FROM public.crm_contacts WHERE lead_types IS NOT NULL
  UNION ALL
  SELECT lead_type AS p FROM public.crm_contacts WHERE lead_type IS NOT NULL AND length(btrim(lead_type)) > 0
) src
WHERE p IS NOT NULL AND length(btrim(p)) > 0
GROUP BY lower(btrim(p)), btrim(p)
ON CONFLICT (name_lower) DO UPDATE
  SET usage_count = EXCLUDED.usage_count,
      updated_at = now();

-- Recompute crm_tags counts (refresh — covers any tags previously missed if trigger lagged)
INSERT INTO public.crm_tags (name, usage_count)
SELECT btrim(t) AS name, COUNT(*) AS usage_count
FROM (
  SELECT unnest(tags) AS t FROM public.crm_contacts WHERE tags IS NOT NULL
) src
WHERE t IS NOT NULL AND length(btrim(t)) > 0
GROUP BY lower(btrim(t)), btrim(t)
ON CONFLICT (name_lower) DO UPDATE
  SET usage_count = EXCLUDED.usage_count,
      updated_at = now();
