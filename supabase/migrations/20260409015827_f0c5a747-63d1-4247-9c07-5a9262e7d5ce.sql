-- Add new columns to crm_contacts
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS campaign_source text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS property_type_pref text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS is_pre_approved boolean DEFAULT false;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS city_pref text;

-- Validation trigger for property_type_pref instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_crm_contacts_property_type_pref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.property_type_pref IS NOT NULL AND NEW.property_type_pref NOT IN ('condo', 'townhome', 'both') THEN
    RAISE EXCEPTION 'property_type_pref must be condo, townhome, or both';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_type_pref ON public.crm_contacts;
CREATE TRIGGER trg_validate_property_type_pref
  BEFORE INSERT OR UPDATE ON public.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_crm_contacts_property_type_pref();

-- Indexes for new filterable columns
CREATE INDEX IF NOT EXISTS idx_crm_contacts_campaign_source ON public.crm_contacts(campaign_source);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_city_pref ON public.crm_contacts(city_pref);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_property_type_pref ON public.crm_contacts(property_type_pref);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_is_pre_approved ON public.crm_contacts(is_pre_approved);