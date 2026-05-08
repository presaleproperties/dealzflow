-- Add a canonical pipeline stage reference to contacts.
ALTER TABLE public.crm_contacts
ADD COLUMN IF NOT EXISTS pipeline_segment_id uuid REFERENCES public.crm_lead_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_pipeline_segment_id
ON public.crm_contacts(pipeline_segment_id);

-- Repair malformed lead_type filters that were stored as one space-separated value.
UPDATE public.crm_lead_segments
SET filter_config = jsonb_set(filter_config, '{lead_type}', '["Pre-Sale", "presale", "Presale"]'::jsonb, true)
WHERE name = 'Presale'
  AND filter_config -> 'lead_type' = '["Pre-Sale presale Presale"]'::jsonb;

UPDATE public.crm_lead_segments
SET filter_config = jsonb_set(filter_config, '{lead_type}', '["Re-Sale", "resale", "Resale"]'::jsonb, true)
WHERE name = 'Resale'
  AND filter_config -> 'lead_type' = '["Re-Sale resale Resale"]'::jsonb;

UPDATE public.crm_lead_segments
SET filter_config = jsonb_set(filter_config, '{lead_type}', '["Commercial", "commercial"]'::jsonb, true)
WHERE name = 'Commercial'
  AND filter_config -> 'lead_type' = '["Commercial commercial"]'::jsonb;

-- Helper: does a contact row match a pipeline segment filter_config?
CREATE OR REPLACE FUNCTION public.crm_contact_matches_pipeline_filter(
  _contact public.crm_contacts,
  _filter jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  status_values text[];
  lead_type_values text[];
  source_values text[];
  tag_values text[];
BEGIN
  IF _filter IS NULL OR _filter = '{}'::jsonb THEN
    RETURN true;
  END IF;

  IF _filter ? 'status' THEN
    SELECT array_agg(value) INTO status_values FROM jsonb_array_elements_text(_filter -> 'status') AS value;
    IF COALESCE(array_length(status_values, 1), 0) > 0 AND NOT COALESCE(_contact.status = ANY(status_values), false) THEN
      RETURN false;
    END IF;
  END IF;

  IF _filter ? 'lead_type' THEN
    SELECT array_agg(value) INTO lead_type_values FROM jsonb_array_elements_text(_filter -> 'lead_type') AS value;
    IF COALESCE(array_length(lead_type_values, 1), 0) > 0
      AND NOT (
        COALESCE(_contact.lead_type = ANY(lead_type_values), false)
        OR COALESCE(_contact.lead_types && lead_type_values, false)
      ) THEN
      RETURN false;
    END IF;
  END IF;

  IF _filter ? 'source' THEN
    SELECT array_agg(value) INTO source_values FROM jsonb_array_elements_text(_filter -> 'source') AS value;
    IF COALESCE(array_length(source_values, 1), 0) > 0 AND NOT COALESCE(_contact.source = ANY(source_values), false) THEN
      RETURN false;
    END IF;
  END IF;

  IF _filter ? 'tags' THEN
    SELECT array_agg(value) INTO tag_values FROM jsonb_array_elements_text(_filter -> 'tags') AS value;
    IF COALESCE(array_length(tag_values, 1), 0) > 0 AND NOT COALESCE(_contact.tags && tag_values, false) THEN
      RETURN false;
    END IF;
  END IF;

  IF _filter ? 'contact_type' AND COALESCE(_contact.contact_type, '') <> (_filter ->> 'contact_type') THEN
    RETURN false;
  END IF;

  IF _filter ? 'assigned_to' AND COALESCE(_contact.assigned_to, '') <> (_filter ->> 'assigned_to') THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Backfill every contact to the first matching configured pipeline stage.
WITH matched AS (
  SELECT DISTINCT ON (c.id)
    c.id AS contact_id,
    s.id AS segment_id
  FROM public.crm_contacts c
  JOIN public.crm_lead_segments s
    ON s.filter_config IS NOT NULL
   AND s.filter_config <> '{}'::jsonb
   AND public.crm_contact_matches_pipeline_filter(c, s.filter_config)
  ORDER BY c.id, s.sort_order ASC
)
UPDATE public.crm_contacts c
SET pipeline_segment_id = matched.segment_id
FROM matched
WHERE c.id = matched.contact_id
  AND c.pipeline_segment_id IS NULL;

-- Keep legacy status/lead_type fields aligned whenever the canonical pipeline is set.
CREATE OR REPLACE FUNCTION public.crm_sync_pipeline_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fc jsonb;
  next_status text;
  next_lead_type text;
BEGIN
  IF NEW.pipeline_segment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT filter_config INTO fc
  FROM public.crm_lead_segments
  WHERE id = NEW.pipeline_segment_id;

  IF fc IS NULL THEN
    RETURN NEW;
  END IF;

  next_status := fc -> 'status' ->> 0;
  next_lead_type := fc -> 'lead_type' ->> 0;

  IF next_status IS NOT NULL AND COALESCE(NEW.status, '') <> next_status THEN
    NEW.status := next_status;
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
    NEW.stage_changed_at := now();
  ELSIF NEW.stage_changed_at IS NULL THEN
    NEW.stage_changed_at := now();
  END IF;

  IF next_lead_type IS NOT NULL THEN
    NEW.lead_type := next_lead_type;
    IF NEW.lead_types IS NULL THEN
      NEW.lead_types := ARRAY[next_lead_type];
    ELSIF NOT (next_lead_type = ANY(NEW.lead_types)) THEN
      NEW.lead_types := array_append(NEW.lead_types, next_lead_type);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_pipeline_fields ON public.crm_contacts;
CREATE TRIGGER trg_crm_sync_pipeline_fields
BEFORE INSERT OR UPDATE OF pipeline_segment_id ON public.crm_contacts
FOR EACH ROW
EXECUTE FUNCTION public.crm_sync_pipeline_fields();