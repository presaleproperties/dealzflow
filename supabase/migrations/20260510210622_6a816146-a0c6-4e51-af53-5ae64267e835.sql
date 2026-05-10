CREATE OR REPLACE FUNCTION public.crm_find_existing_conversation(
  _contact_id uuid,
  _channel text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _channel_group text[];
  _is_email      boolean := lower(_channel) = 'email';
  _conv_id       uuid;
  _ids           uuid[];
BEGIN
  IF _contact_id IS NULL THEN
    RETURN NULL;
  END IF;

  _channel_group := CASE WHEN _is_email THEN ARRAY['email'] ELSE ARRAY['sms','whatsapp'] END;

  -- 1) Collect every normalized identifier we know for the seed contact.
  --    Pulls from the Identity Vault AND the contact row itself.
  WITH seed AS (
    -- Identity Vault entries
    SELECT kind, value
    FROM public.crm_contact_identities
    WHERE contact_id = _contact_id
      AND ((_is_email AND kind = 'email') OR (NOT _is_email AND kind = 'phone'))
      AND value IS NOT NULL AND value <> ''
    UNION
    -- Direct contact-row fallback
    SELECT 'email', public.crm_normalize_email(c.email)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id AND _is_email AND c.email IS NOT NULL AND c.email <> ''
    UNION
    SELECT 'email', public.crm_normalize_email(c.email_secondary)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id AND _is_email AND c.email_secondary IS NOT NULL AND c.email_secondary <> ''
    UNION
    SELECT 'phone', public.crm_normalize_phone(c.phone)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id AND NOT _is_email AND c.phone IS NOT NULL AND c.phone <> ''
    UNION
    SELECT 'phone', public.crm_normalize_phone(c.phone_secondary)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id AND NOT _is_email AND c.phone_secondary IS NOT NULL AND c.phone_secondary <> ''
  ),
  -- 2) Find every contact_id that shares any of those identifiers — via the
  --    vault OR via the raw contact columns (normalized).
  peers_via_vault AS (
    SELECT DISTINCT ci.contact_id
    FROM public.crm_contact_identities ci
    JOIN seed s ON s.kind = ci.kind AND s.value IS NOT NULL AND s.value <> '' AND s.value = ci.value
  ),
  peers_via_contacts AS (
    SELECT DISTINCT c.id AS contact_id
    FROM public.crm_contacts c, seed s
    WHERE s.value IS NOT NULL AND s.value <> ''
      AND (
        (    _is_email AND s.kind = 'email'
             AND (public.crm_normalize_email(c.email) = s.value
               OR public.crm_normalize_email(c.email_secondary) = s.value))
        OR
        (NOT _is_email AND s.kind = 'phone'
             AND (public.crm_normalize_phone(c.phone) = s.value
               OR public.crm_normalize_phone(c.phone_secondary) = s.value))
      )
  )
  SELECT array_agg(DISTINCT id) INTO _ids
  FROM (
    SELECT _contact_id AS id
    UNION SELECT contact_id FROM peers_via_vault
    UNION SELECT contact_id FROM peers_via_contacts
  ) u;

  IF _ids IS NULL OR array_length(_ids, 1) = 0 THEN
    _ids := ARRAY[_contact_id];
  END IF;

  -- 3) Pick the most recently active conversation in the requested channel
  --    family that the caller is allowed to see.
  SELECT cv.id INTO _conv_id
  FROM public.crm_conversations cv
  WHERE cv.contact_id = ANY(_ids)
    AND cv.channel = ANY(_channel_group)
    AND public.crm_can_see_contact_id(auth.uid(), cv.contact_id)
  ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC
  LIMIT 1;

  RETURN _conv_id;
END;
$$;
