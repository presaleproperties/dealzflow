CREATE OR REPLACE FUNCTION public.enforce_contact_has_email_or_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.email IS NULL OR btrim(NEW.email) = '')
     AND (NEW.phone IS NULL OR btrim(NEW.phone) = '') THEN
    RAISE EXCEPTION 'A lead must have either an email or a phone number';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_contacts_require_email_or_phone ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_require_email_or_phone
BEFORE INSERT ON public.crm_contacts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contact_has_email_or_phone();