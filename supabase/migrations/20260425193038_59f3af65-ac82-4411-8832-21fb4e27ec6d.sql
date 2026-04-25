ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (
    NULLIF(RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10), '')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone_normalized
  ON public.crm_contacts (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email_lower
  ON public.crm_contacts (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE OR REPLACE FUNCTION public.find_potential_duplicate(
  _email TEXT,
  _phone TEXT,
  _first_name TEXT DEFAULT NULL,
  _last_name TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  match_type TEXT,
  confidence TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_lower TEXT := lower(NULLIF(btrim(_email), ''));
  v_phone_norm TEXT := NULLIF(RIGHT(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), 10), '');
  v_first_lower TEXT := lower(NULLIF(btrim(_first_name), ''));
  v_last_lower TEXT := lower(NULLIF(btrim(_last_name), ''));
BEGIN
  IF v_email_lower IS NOT NULL THEN
    RETURN QUERY
    SELECT c.id, 'email'::text, 'high'::text, c.first_name, c.last_name, c.email, c.phone
    FROM public.crm_contacts c
    WHERE lower(c.email) = v_email_lower
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF v_phone_norm IS NOT NULL AND (v_first_lower IS NOT NULL OR v_last_lower IS NOT NULL) THEN
    RETURN QUERY
    SELECT c.id, 'phone+name'::text, 'high'::text, c.first_name, c.last_name, c.email, c.phone
    FROM public.crm_contacts c
    WHERE c.phone_normalized = v_phone_norm
      AND (
        (v_first_lower IS NOT NULL AND lower(c.first_name) = v_first_lower) OR
        (v_last_lower  IS NOT NULL AND lower(c.last_name)  = v_last_lower)
      )
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF v_phone_norm IS NOT NULL THEN
    RETURN QUERY
    SELECT c.id, 'phone'::text, 'low'::text, c.first_name, c.last_name, c.email, c.phone
    FROM public.crm_contacts c
    WHERE c.phone_normalized = v_phone_norm
    LIMIT 1;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.crm_potential_duplicates AS
SELECT
  lower(email) AS match_key,
  'email'::text AS match_type,
  array_agg(id ORDER BY last_touch_at DESC NULLS LAST, lead_score DESC) AS contact_ids,
  COUNT(*) AS dup_count
FROM public.crm_contacts
WHERE email IS NOT NULL AND email <> ''
GROUP BY lower(email)
HAVING COUNT(*) > 1
UNION ALL
SELECT
  phone_normalized || '|' || lower(first_name) AS match_key,
  'phone+first_name'::text AS match_type,
  array_agg(id ORDER BY last_touch_at DESC NULLS LAST, lead_score DESC) AS contact_ids,
  COUNT(*) AS dup_count
FROM public.crm_contacts
WHERE phone_normalized IS NOT NULL AND first_name IS NOT NULL AND first_name <> ''
GROUP BY phone_normalized, lower(first_name)
HAVING COUNT(*) > 1;

GRANT SELECT ON public.crm_potential_duplicates TO authenticated;