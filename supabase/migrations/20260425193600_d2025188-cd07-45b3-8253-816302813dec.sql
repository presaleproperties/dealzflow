
-- Source Manager: merge & rename canonical sources
-- Admin-only RPC that re-points crm_contacts and removes the old crm_sources row.

CREATE OR REPLACE FUNCTION public.merge_crm_sources(
  _from_names TEXT[],
  _to_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moved INT := 0;
  _to_trimmed TEXT := trim(_to_name);
BEGIN
  -- Auth gate: only CRM admins/owners may merge
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can merge sources';
  END IF;

  IF _to_trimmed IS NULL OR length(_to_trimmed) = 0 THEN
    RAISE EXCEPTION 'Destination source name is required';
  END IF;

  IF _from_names IS NULL OR array_length(_from_names, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one source must be selected to merge';
  END IF;

  -- Ensure destination exists in the canonical library
  INSERT INTO public.crm_sources (name, usage_count)
  VALUES (_to_trimmed, 0)
  ON CONFLICT (name_lower) DO NOTHING;

  -- Re-point all contacts using any of the from-sources to the canonical name
  WITH updated AS (
    UPDATE public.crm_contacts
       SET source = _to_trimmed
     WHERE source = ANY(_from_names)
       AND source <> _to_trimmed
    RETURNING 1
  )
  SELECT count(*) INTO _moved FROM updated;

  -- Drop the now-empty source rows (skip the destination)
  DELETE FROM public.crm_sources
   WHERE lower(name) = ANY (
           SELECT lower(n) FROM unnest(_from_names) AS n
         )
     AND lower(name) <> lower(_to_trimmed);

  RETURN jsonb_build_object(
    'moved_contacts', _moved,
    'destination', _to_trimmed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_crm_sources(TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_crm_sources(TEXT[], TEXT) TO authenticated;

-- Rename a single source (admin only)
CREATE OR REPLACE FUNCTION public.rename_crm_source(
  _from_name TEXT,
  _to_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _moved INT := 0;
  _to_trimmed TEXT := trim(_to_name);
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can rename sources';
  END IF;

  IF _to_trimmed IS NULL OR length(_to_trimmed) = 0 THEN
    RAISE EXCEPTION 'New source name is required';
  END IF;

  -- If destination already exists, treat as a merge
  IF EXISTS (SELECT 1 FROM public.crm_sources WHERE lower(name) = lower(_to_trimmed))
     AND lower(_from_name) <> lower(_to_trimmed) THEN
    RETURN public.merge_crm_sources(ARRAY[_from_name], _to_trimmed);
  END IF;

  WITH updated AS (
    UPDATE public.crm_contacts
       SET source = _to_trimmed
     WHERE source = _from_name
    RETURNING 1
  )
  SELECT count(*) INTO _moved FROM updated;

  UPDATE public.crm_sources
     SET name = _to_trimmed, updated_at = now()
   WHERE lower(name) = lower(_from_name);

  RETURN jsonb_build_object('moved_contacts', _moved, 'destination', _to_trimmed);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_crm_source(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_crm_source(TEXT, TEXT) TO authenticated;
