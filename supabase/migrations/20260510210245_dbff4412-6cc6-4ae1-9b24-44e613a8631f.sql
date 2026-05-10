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
  _conv_id uuid;
  _ids uuid[];
BEGIN
  IF _contact_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Channel families: SMS and WhatsApp share a phone-based inbox; email is its own.
  IF lower(_channel) = 'email' THEN
    _channel_group := ARRAY['email'];
  ELSE
    _channel_group := ARRAY['sms','whatsapp'];
  END IF;

  -- Build the candidate set of contact_ids that share any normalized identifier
  -- (phone digits or lowercased email) with the seed contact, walking through
  -- the Identity Vault. Falls back to direct phone/email columns when needed.
  WITH seed_identities AS (
    SELECT kind, value
    FROM public.crm_contact_identities
    WHERE contact_id = _contact_id
      AND (
        (lower(_channel) = 'email' AND kind = 'email')
        OR (lower(_channel) <> 'email' AND kind = 'phone')
      )
    UNION
    -- Fallback: derive normalized identities from the contact row itself in
    -- case the vault hasn't been populated for legacy data.
    SELECT 'email', public.crm_normalize_email(c.email)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id
      AND lower(_channel) = 'email'
      AND c.email IS NOT NULL AND c.email <> ''
    UNION
    SELECT 'email', public.crm_normalize_email(c.email_secondary)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id
      AND lower(_channel) = 'email'
      AND c.email_secondary IS NOT NULL AND c.email_secondary <> ''
    UNION
    SELECT 'phone', public.crm_normalize_phone(c.phone)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id
      AND lower(_channel) <> 'email'
      AND c.phone IS NOT NULL AND c.phone <> ''
    UNION
    SELECT 'phone', public.crm_normalize_phone(c.phone_secondary)
    FROM public.crm_contacts c
    WHERE c.id = _contact_id
      AND lower(_channel) <> 'email'
      AND c.phone_secondary IS NOT NULL AND c.phone_secondary <> ''
  ),
  peer_ids AS (
    SELECT DISTINCT ci.contact_id
    FROM public.crm_contact_identities ci
    JOIN seed_identities si
      ON si.kind = ci.kind
     AND si.value IS NOT NULL
     AND si.value <> ''
     AND si.value = ci.value
  )
  SELECT array_agg(DISTINCT id) INTO _ids
  FROM (
    SELECT _contact_id AS id
    UNION
    SELECT contact_id FROM peer_ids
  ) all_ids;

  IF _ids IS NULL OR array_length(_ids, 1) = 0 THEN
    _ids := ARRAY[_contact_id];
  END IF;

  -- Pick the most recently active conversation in the requested channel family
  -- that the caller is allowed to see.
  SELECT cv.id
  INTO _conv_id
  FROM public.crm_conversations cv
  WHERE cv.contact_id = ANY(_ids)
    AND cv.channel = ANY(_channel_group)
    AND public.crm_can_see_contact_id(auth.uid(), cv.contact_id)
  ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC
  LIMIT 1;

  RETURN _conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_find_existing_conversation(uuid, text) TO authenticated;
