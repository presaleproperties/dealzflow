
-- Add AI summary metadata columns
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary_stale boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_ai_summary_stale
  ON public.crm_contacts(ai_summary_stale)
  WHERE ai_summary_stale = true;

-- Function: mark a contact's summary as stale
CREATE OR REPLACE FUNCTION public.mark_ai_summary_stale(_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _contact_id IS NULL THEN RETURN; END IF;
  UPDATE public.crm_contacts
     SET ai_summary_stale = true
   WHERE id = _contact_id
     AND ai_summary_stale = false;
END;
$$;

-- Trigger: on contact update, mark stale if any key field changed
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
     OR (NEW.language_pref IS DISTINCT FROM OLD.language_pref)
     OR (NEW.tags IS DISTINCT FROM OLD.tags)
     OR (NEW.property_type_pref IS DISTINCT FROM OLD.property_type_pref)
  THEN
    NEW.ai_summary_stale := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_summary_on_contact_update ON public.crm_contacts;
CREATE TRIGGER trg_ai_summary_on_contact_update
BEFORE UPDATE ON public.crm_contacts
FOR EACH ROW
EXECUTE FUNCTION public.trg_ai_summary_on_contact_update();

-- Trigger: when a new note is added, mark summary stale (skip ai_summary itself)
CREATE OR REPLACE FUNCTION public.trg_ai_summary_on_note_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  v_type := COALESCE(NEW.note_type, OLD.note_type, '');
  IF v_type = 'ai_summary' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.mark_ai_summary_stale(COALESCE(NEW.contact_id, OLD.contact_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_summary_on_note_change ON public.crm_notes;
CREATE TRIGGER trg_ai_summary_on_note_change
AFTER INSERT OR UPDATE OR DELETE ON public.crm_notes
FOR EACH ROW
EXECUTE FUNCTION public.trg_ai_summary_on_note_change();
