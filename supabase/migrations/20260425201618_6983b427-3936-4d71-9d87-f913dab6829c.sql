
CREATE OR REPLACE FUNCTION public.trg_ai_summary_on_contact_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
     OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     OR (NEW.source IS DISTINCT FROM OLD.source)
     OR (NEW.lead_type IS DISTINCT FROM OLD.lead_type)
     OR (NEW.lead_types IS DISTINCT FROM OLD.lead_types)
     OR (NEW.project IS DISTINCT FROM OLD.project)
     OR (NEW.projects IS DISTINCT FROM OLD.projects)
     OR (NEW.budget_min IS DISTINCT FROM OLD.budget_min)
     OR (NEW.budget_max IS DISTINCT FROM OLD.budget_max)
     OR (NEW.city IS DISTINCT FROM OLD.city)
     OR (NEW.city_pref IS DISTINCT FROM OLD.city_pref)
     OR (NEW.language IS DISTINCT FROM OLD.language)
     OR (NEW.tags IS DISTINCT FROM OLD.tags)
     OR (NEW.property_type_pref IS DISTINCT FROM OLD.property_type_pref)
     OR (NEW.bedrooms_preferred IS DISTINCT FROM OLD.bedrooms_preferred)
  THEN
    NEW.ai_summary_stale := true;
  END IF;
  RETURN NEW;
END;
$$;
