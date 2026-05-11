
-- Backfill helper: link orphan crm_activity_events to a contact via primary
-- email/phone OR identity-vault entries (alternate emails/phones).
CREATE OR REPLACE FUNCTION public.crm_backfill_orphan_activity(_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emails text[];
  v_phones text[];
  v_count  integer := 0;
BEGIN
  IF _contact_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    ARRAY(
      SELECT DISTINCT lower(x) FROM (
        SELECT email FROM public.crm_contacts WHERE id = _contact_id AND email IS NOT NULL
        UNION ALL
        SELECT email_secondary FROM public.crm_contacts WHERE id = _contact_id AND email_secondary IS NOT NULL
        UNION ALL
        SELECT value FROM public.crm_contact_identities
          WHERE contact_id = _contact_id AND kind = 'email'
      ) AS t(x) WHERE x IS NOT NULL AND x <> ''
    ),
    ARRAY(
      SELECT DISTINCT x FROM (
        SELECT phone FROM public.crm_contacts WHERE id = _contact_id AND phone IS NOT NULL
        UNION ALL
        SELECT phone_secondary FROM public.crm_contacts WHERE id = _contact_id AND phone_secondary IS NOT NULL
        UNION ALL
        SELECT value FROM public.crm_contact_identities
          WHERE contact_id = _contact_id AND kind = 'phone'
      ) AS t(x) WHERE x IS NOT NULL AND x <> ''
    )
  INTO v_emails, v_phones;

  IF (array_length(v_emails, 1) IS NULL) AND (array_length(v_phones, 1) IS NULL) THEN
    RETURN 0;
  END IF;

  WITH upd AS (
    UPDATE public.crm_activity_events ae
    SET contact_id = _contact_id
    WHERE ae.contact_id IS NULL
      AND (
        (v_emails IS NOT NULL AND lower(ae.lead_email) = ANY(v_emails))
        OR (v_phones IS NOT NULL AND ae.lead_phone = ANY(v_phones))
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_backfill_orphan_activity(uuid) TO service_role, authenticated;

-- Trigger on crm_contacts: backfill on insert and on email/phone changes
CREATE OR REPLACE FUNCTION public.crm_contacts_backfill_activity_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crm_backfill_orphan_activity(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_contacts_backfill_activity ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_backfill_activity
AFTER INSERT OR UPDATE OF email, email_secondary, phone, phone_secondary
ON public.crm_contacts
FOR EACH ROW
EXECUTE FUNCTION public.crm_contacts_backfill_activity_trg();

-- Trigger on crm_contact_identities: backfill when alternate identity is added
CREATE OR REPLACE FUNCTION public.crm_identities_backfill_activity_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crm_backfill_orphan_activity(NEW.contact_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_identities_backfill_activity ON public.crm_contact_identities;
CREATE TRIGGER trg_crm_identities_backfill_activity
AFTER INSERT OR UPDATE OF value
ON public.crm_contact_identities
FOR EACH ROW
EXECUTE FUNCTION public.crm_identities_backfill_activity_trg();

-- One-time historical sweep: link existing orphans by primary email
UPDATE public.crm_activity_events ae
SET contact_id = c.id
FROM public.crm_contacts c
WHERE ae.contact_id IS NULL
  AND ae.lead_email IS NOT NULL
  AND lower(ae.lead_email) = lower(c.email);

-- One-time sweep via identity vault
UPDATE public.crm_activity_events ae
SET contact_id = ci.contact_id
FROM public.crm_contact_identities ci
WHERE ae.contact_id IS NULL
  AND ci.kind = 'email'
  AND ae.lead_email IS NOT NULL
  AND lower(ae.lead_email) = lower(ci.value);

UPDATE public.crm_activity_events ae
SET contact_id = ci.contact_id
FROM public.crm_contact_identities ci
WHERE ae.contact_id IS NULL
  AND ci.kind = 'phone'
  AND ae.lead_phone IS NOT NULL
  AND ae.lead_phone = ci.value;
