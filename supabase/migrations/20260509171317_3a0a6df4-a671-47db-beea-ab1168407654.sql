-- Normalizers
CREATE OR REPLACE FUNCTION public.crm_normalize_email(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _v IS NULL OR btrim(_v) = '' THEN NULL
    ELSE lower(
      regexp_replace(split_part(btrim(_v), '@', 1), '\+.*$', '')
      || '@' || split_part(btrim(_v), '@', 2)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.crm_normalize_phone(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _v IS NULL THEN NULL
    WHEN length(regexp_replace(_v, '\D', '', 'g')) = 10
      THEN '+1' || regexp_replace(_v, '\D', '', 'g')
    WHEN length(regexp_replace(_v, '\D', '', 'g')) = 11
      AND left(regexp_replace(_v, '\D', '', 'g'), 1) = '1'
      THEN '+' || regexp_replace(_v, '\D', '', 'g')
    WHEN length(regexp_replace(_v, '\D', '', 'g')) >= 8
      THEN '+' || regexp_replace(_v, '\D', '', 'g')
    ELSE NULL
  END
$$;

-- Vault table
CREATE TABLE IF NOT EXISTS public.crm_contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','phone')),
  value text NOT NULL,
  raw_value text,
  source text,
  is_primary boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (kind, value)
);
CREATE INDEX IF NOT EXISTS idx_crm_contact_identities_contact ON public.crm_contact_identities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_identities_kind_value ON public.crm_contact_identities(kind, value);

ALTER TABLE public.crm_contact_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Identities visible to those who can see contact" ON public.crm_contact_identities;
CREATE POLICY "Identities visible to those who can see contact"
ON public.crm_contact_identities
FOR SELECT
USING (public.crm_can_see_contact_id(auth.uid(), contact_id));

DROP POLICY IF EXISTS "Service role manages identities" ON public.crm_contact_identities;
CREATE POLICY "Service role manages identities"
ON public.crm_contact_identities
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Upsert helper
CREATE OR REPLACE FUNCTION public.crm_record_identity(
  _contact_id uuid, _kind text, _value text,
  _source text DEFAULT NULL, _is_primary boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE norm text; rid uuid;
BEGIN
  IF _contact_id IS NULL OR _value IS NULL THEN RETURN NULL; END IF;
  norm := CASE _kind WHEN 'email' THEN public.crm_normalize_email(_value)
                     WHEN 'phone' THEN public.crm_normalize_phone(_value)
                     ELSE NULL END;
  IF norm IS NULL OR norm = '' THEN RETURN NULL; END IF;

  INSERT INTO public.crm_contact_identities (contact_id, kind, value, raw_value, source, is_primary)
  VALUES (_contact_id, _kind, norm, _value, _source, _is_primary)
  ON CONFLICT (kind, value) DO UPDATE
    SET last_seen_at = now(),
        is_primary = public.crm_contact_identities.is_primary OR EXCLUDED.is_primary,
        source = COALESCE(public.crm_contact_identities.source, EXCLUDED.source)
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

-- Resolver
CREATE OR REPLACE FUNCTION public.crm_resolve_contact_identity(
  _email text DEFAULT NULL, _phone text DEFAULT NULL
) RETURNS TABLE(contact_id uuid, matched_on text, matched_value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ne text := public.crm_normalize_email(_email);
        np text := public.crm_normalize_phone(_phone);
BEGIN
  IF ne IS NOT NULL THEN
    RETURN QUERY SELECT i.contact_id, 'email'::text, i.value
      FROM public.crm_contact_identities i WHERE i.kind='email' AND i.value=ne LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  IF np IS NOT NULL THEN
    RETURN QUERY SELECT i.contact_id, 'phone'::text, i.value
      FROM public.crm_contact_identities i WHERE i.kind='phone' AND i.value=np LIMIT 1;
  END IF;
END;
$$;

-- Attach alternate (no overwrite of primary)
CREATE OR REPLACE FUNCTION public.crm_attach_alternate(
  _contact_id uuid, _email text DEFAULT NULL, _phone text DEFAULT NULL,
  _source text DEFAULT 'presale_form'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
        ne text := public.crm_normalize_email(_email);
        np text := public.crm_normalize_phone(_phone);
BEGIN
  IF _contact_id IS NULL THEN RETURN; END IF;
  SELECT id, email, email_secondary, phone, phone_secondary INTO c
    FROM public.crm_contacts WHERE id = _contact_id;
  IF c IS NULL THEN RETURN; END IF;

  IF ne IS NOT NULL THEN
    PERFORM public.crm_record_identity(_contact_id, 'email', ne, _source, false);
    IF (c.email IS NULL OR c.email = '') THEN
      UPDATE public.crm_contacts SET email = ne WHERE id = _contact_id;
    ELSIF public.crm_normalize_email(c.email) <> ne
      AND (c.email_secondary IS NULL OR c.email_secondary = ''
           OR public.crm_normalize_email(c.email_secondary) <> ne) THEN
      UPDATE public.crm_contacts SET email_secondary = ne WHERE id = _contact_id;
    END IF;
  END IF;

  IF np IS NOT NULL THEN
    PERFORM public.crm_record_identity(_contact_id, 'phone', np, _source, false);
    IF (c.phone IS NULL OR c.phone = '') THEN
      UPDATE public.crm_contacts SET phone = np WHERE id = _contact_id;
    ELSIF public.crm_normalize_phone(c.phone) <> np
      AND (c.phone_secondary IS NULL OR c.phone_secondary = ''
           OR public.crm_normalize_phone(c.phone_secondary) <> np) THEN
      UPDATE public.crm_contacts SET phone_secondary = np WHERE id = _contact_id;
    END IF;
  END IF;
END;
$$;

-- Auto-sync trigger
CREATE OR REPLACE FUNCTION public.crm_sync_contact_identities()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    PERFORM public.crm_record_identity(NEW.id, 'email', NEW.email, COALESCE(NEW.sync_source,'contact_primary'), true);
  END IF;
  IF NEW.email_secondary IS NOT NULL AND NEW.email_secondary <> '' THEN
    PERFORM public.crm_record_identity(NEW.id, 'email', NEW.email_secondary, COALESCE(NEW.sync_source,'contact_secondary'), false);
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    PERFORM public.crm_record_identity(NEW.id, 'phone', NEW.phone, COALESCE(NEW.sync_source,'contact_primary'), true);
  END IF;
  IF NEW.phone_secondary IS NOT NULL AND NEW.phone_secondary <> '' THEN
    PERFORM public.crm_record_identity(NEW.id, 'phone', NEW.phone_secondary, COALESCE(NEW.sync_source,'contact_secondary'), false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_contact_identities ON public.crm_contacts;
CREATE TRIGGER trg_crm_sync_contact_identities
AFTER INSERT OR UPDATE OF email, email_secondary, phone, phone_secondary
ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_sync_contact_identities();

-- Backfill
INSERT INTO public.crm_contact_identities (contact_id, kind, value, raw_value, source, is_primary, first_seen_at, last_seen_at)
SELECT id, 'email', public.crm_normalize_email(email), email, 'system_backfill', true, COALESCE(created_at, now()), COALESCE(last_touch_at, created_at, now())
FROM public.crm_contacts WHERE email IS NOT NULL AND email<>'' AND public.crm_normalize_email(email) IS NOT NULL
ON CONFLICT (kind, value) DO NOTHING;

INSERT INTO public.crm_contact_identities (contact_id, kind, value, raw_value, source, is_primary, first_seen_at, last_seen_at)
SELECT id, 'email', public.crm_normalize_email(email_secondary), email_secondary, 'system_backfill', false, COALESCE(created_at, now()), COALESCE(last_touch_at, created_at, now())
FROM public.crm_contacts WHERE email_secondary IS NOT NULL AND email_secondary<>'' AND public.crm_normalize_email(email_secondary) IS NOT NULL
ON CONFLICT (kind, value) DO NOTHING;

INSERT INTO public.crm_contact_identities (contact_id, kind, value, raw_value, source, is_primary, first_seen_at, last_seen_at)
SELECT id, 'phone', public.crm_normalize_phone(phone), phone, 'system_backfill', true, COALESCE(created_at, now()), COALESCE(last_touch_at, created_at, now())
FROM public.crm_contacts WHERE phone IS NOT NULL AND phone<>'' AND public.crm_normalize_phone(phone) IS NOT NULL
ON CONFLICT (kind, value) DO NOTHING;

INSERT INTO public.crm_contact_identities (contact_id, kind, value, raw_value, source, is_primary, first_seen_at, last_seen_at)
SELECT id, 'phone', public.crm_normalize_phone(phone_secondary), phone_secondary, 'system_backfill', false, COALESCE(created_at, now()), COALESCE(last_touch_at, created_at, now())
FROM public.crm_contacts WHERE phone_secondary IS NOT NULL AND phone_secondary<>'' AND public.crm_normalize_phone(phone_secondary) IS NOT NULL
ON CONFLICT (kind, value) DO NOTHING;