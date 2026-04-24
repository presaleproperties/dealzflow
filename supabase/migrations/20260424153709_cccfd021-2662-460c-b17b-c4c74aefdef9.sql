-- Trigger function: if a contact has a 'realtor' tag (case-insensitive), force lead_type='realtor'
CREATE OR REPLACE FUNCTION public.enforce_realtor_lead_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tags IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(NEW.tags) AS t WHERE lower(btrim(t)) = 'realtor'
     )
  THEN
    NEW.lead_type := 'realtor';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_realtor_lead_type ON public.crm_contacts;
CREATE TRIGGER trg_enforce_realtor_lead_type
BEFORE INSERT OR UPDATE OF tags, lead_type ON public.crm_contacts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_realtor_lead_type();

-- Backfill: any existing contact tagged 'realtor' (case-insensitive) gets lead_type='realtor'
UPDATE public.crm_contacts
SET lead_type = 'realtor'
WHERE tags IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(tags) AS t WHERE lower(btrim(t)) = 'realtor'
  )
  AND (lead_type IS DISTINCT FROM 'realtor');