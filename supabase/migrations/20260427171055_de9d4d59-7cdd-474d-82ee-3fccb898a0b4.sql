-- ============================================================
-- KNOWLEDGE BASE: Projects, Cities, Neighborhoods
-- Purely additive. Does NOT modify crm_contacts, tags, or
-- anything connected to existing leads.
-- ============================================================

-- 1) Enrich crm_projects with rich metadata
ALTER TABLE public.crm_projects
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT DEFAULT 'BC',
  ADD COLUMN IF NOT EXISTS developer TEXT,
  ADD COLUMN IF NOT EXISTS property_type TEXT, -- condo | townhome | detached | mixed
  ADD COLUMN IF NOT EXISTS bedrooms_offered INT[], -- e.g. {1,2,3}
  ADD COLUMN IF NOT EXISTS price_from NUMERIC,
  ADD COLUMN IF NOT EXISTS price_to NUMERIC,
  ADD COLUMN IF NOT EXISTS status TEXT, -- presale | under_construction | move_in_ready | sold_out | completed
  ADD COLUMN IF NOT EXISTS completion_date DATE,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS marketing_url TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[],
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_projects_city ON public.crm_projects(lower(city));
CREATE INDEX IF NOT EXISTS idx_crm_projects_status ON public.crm_projects(status);
CREATE INDEX IF NOT EXISTS idx_crm_projects_active ON public.crm_projects(is_active);

-- 2) Cities lookup
CREATE TABLE IF NOT EXISTS public.crm_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(name)) STORED UNIQUE,
  region TEXT, -- e.g. Fraser Valley, Greater Vancouver
  province TEXT DEFAULT 'BC',
  project_count INT NOT NULL DEFAULT 0,
  lead_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view cities" ON public.crm_cities
  FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can manage cities" ON public.crm_cities
  FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

CREATE TRIGGER update_crm_cities_updated_at
  BEFORE UPDATE ON public.crm_cities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Neighborhoods lookup
CREATE TABLE IF NOT EXISTS public.crm_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city_id UUID REFERENCES public.crm_cities(id) ON DELETE SET NULL,
  city_name TEXT, -- denormalized for fast lookup
  project_count INT NOT NULL DEFAULT 0,
  lead_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, city_id)
);

ALTER TABLE public.crm_neighborhoods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view neighborhoods" ON public.crm_neighborhoods
  FOR SELECT USING (public.is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can manage neighborhoods" ON public.crm_neighborhoods
  FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

CREATE TRIGGER update_crm_neighborhoods_updated_at
  BEFORE UPDATE ON public.crm_neighborhoods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_crm_neighborhoods_city ON public.crm_neighborhoods(city_id);

-- 4) Allow CRM members to update project metadata
DROP POLICY IF EXISTS "CRM admins can manage projects" ON public.crm_projects;
CREATE POLICY "CRM admins can manage projects" ON public.crm_projects
  FOR ALL USING (public.is_crm_admin(auth.uid())) WITH CHECK (public.is_crm_admin(auth.uid()));

-- 5) Backfill projects from presale-properties behavior views
INSERT INTO public.crm_projects (name, view_count, last_viewed_at, usage_count)
SELECT
  btrim(property_name),
  COUNT(*)::int,
  MAX(viewed_at),
  0
FROM public.crm_lead_behavior_views
WHERE property_name IS NOT NULL AND length(btrim(property_name)) > 0
GROUP BY btrim(property_name)
ON CONFLICT (name_lower) DO UPDATE
  SET view_count = EXCLUDED.view_count,
      last_viewed_at = EXCLUDED.last_viewed_at,
      updated_at = now();

-- Backfill lead_count: how many distinct contacts viewed each project
WITH project_leads AS (
  SELECT btrim(property_name) AS name, COUNT(DISTINCT contact_id) AS leads
  FROM public.crm_lead_behavior_views
  WHERE property_name IS NOT NULL AND contact_id IS NOT NULL
  GROUP BY btrim(property_name)
)
UPDATE public.crm_projects p
SET lead_count = pl.leads
FROM project_leads pl
WHERE p.name_lower = lower(pl.name);

-- 6) Backfill cities from crm_contacts
INSERT INTO public.crm_cities (name, lead_count)
SELECT btrim(city), COUNT(*)::int
FROM public.crm_contacts
WHERE city IS NOT NULL AND length(btrim(city)) > 0
GROUP BY btrim(city)
ON CONFLICT (name_lower) DO UPDATE
  SET lead_count = EXCLUDED.lead_count,
      updated_at = now();

-- Mark Fraser Valley cities (per project memory)
UPDATE public.crm_cities
SET region = 'Fraser Valley'
WHERE lower(name) IN (
  'abbotsford','chilliwack','mission','langley','surrey','white rock',
  'maple ridge','pitt meadows','delta','tsawwassen','ladner','hope','agassiz'
);

-- 7) Auto-maintain city counters when contacts change
CREATE OR REPLACE FUNCTION public.sync_crm_cities_from_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_city TEXT;
  new_city TEXT;
BEGIN
  old_city := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN btrim(OLD.city) ELSE NULL END;
  new_city := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN btrim(NEW.city) ELSE NULL END;

  IF old_city IS DISTINCT FROM new_city THEN
    IF new_city IS NOT NULL AND length(new_city) > 0 THEN
      INSERT INTO public.crm_cities (name, lead_count)
      VALUES (new_city, 1)
      ON CONFLICT (name_lower) DO UPDATE
        SET lead_count = public.crm_cities.lead_count + 1,
            updated_at = now();
    END IF;
    IF old_city IS NOT NULL AND length(old_city) > 0 THEN
      UPDATE public.crm_cities
      SET lead_count = GREATEST(lead_count - 1, 0), updated_at = now()
      WHERE name_lower = lower(old_city);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_crm_cities_trigger ON public.crm_contacts;
CREATE TRIGGER sync_crm_cities_trigger
  AFTER INSERT OR UPDATE OF city OR DELETE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_cities_from_contact();

-- 8) Auto-maintain project view_count when behavior views land
CREATE OR REPLACE FUNCTION public.sync_crm_project_from_view()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.property_name IS NOT NULL AND length(btrim(NEW.property_name)) > 0 THEN
    INSERT INTO public.crm_projects (name, view_count, last_viewed_at)
    VALUES (btrim(NEW.property_name), 1, NEW.viewed_at)
    ON CONFLICT (name_lower) DO UPDATE
      SET view_count = public.crm_projects.view_count + 1,
          last_viewed_at = GREATEST(public.crm_projects.last_viewed_at, NEW.viewed_at),
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_crm_project_view_trigger ON public.crm_lead_behavior_views;
CREATE TRIGGER sync_crm_project_view_trigger
  AFTER INSERT ON public.crm_lead_behavior_views
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_project_from_view();