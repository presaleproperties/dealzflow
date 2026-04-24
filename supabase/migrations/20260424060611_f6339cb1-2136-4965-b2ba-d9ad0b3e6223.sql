-- Helper function: split a single text value on multi-value delimiters into clean parts
CREATE OR REPLACE FUNCTION public.split_crm_multi_value(input text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  parts text[];
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Split on: " - " / " – " / " — " (dash with surrounding spaces) OR | / , ; newline / carriage return
  parts := regexp_split_to_array(input, '\s+[-–—]\s+|[|/,;\n\r]+');

  -- Trim, strip wrapping quotes, drop empties
  SELECT array_agg(cleaned)
    INTO parts
  FROM (
    SELECT regexp_replace(btrim(p), '^[''"]+|[''"]+$', '', 'g') AS cleaned
    FROM unnest(parts) AS p
  ) sub
  WHERE cleaned IS NOT NULL AND cleaned <> '';

  RETURN COALESCE(parts, ARRAY[]::text[]);
END;
$$;

-- Helper function: normalize an entire text[] array - split each entry, dedupe case-insensitively
CREATE OR REPLACE FUNCTION public.normalize_crm_multi_array(input text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  expanded text[];
  result text[];
BEGIN
  IF input IS NULL OR array_length(input, 1) IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Expand each element via split_crm_multi_value
  SELECT array_agg(item)
    INTO expanded
  FROM (
    SELECT unnest(public.split_crm_multi_value(elem)) AS item
    FROM unnest(input) AS elem
  ) sub
  WHERE item IS NOT NULL AND item <> '';

  IF expanded IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Dedupe case-insensitively, keep first-seen casing, preserve order
  SELECT array_agg(value ORDER BY first_idx)
    INTO result
  FROM (
    SELECT value, MIN(idx) AS first_idx
    FROM (
      SELECT value, ordinality AS idx
      FROM unnest(expanded) WITH ORDINALITY AS t(value, ordinality)
    ) numbered
    GROUP BY lower(value), value
  ) deduped_with_case
  -- Final pass: collapse case-insensitive duplicates that survived (keep earliest)
  ;

  -- Second dedupe pass on lower(value) to ensure case-insensitive uniqueness
  SELECT array_agg(value ORDER BY first_idx)
    INTO result
  FROM (
    SELECT DISTINCT ON (lower(value)) value, first_idx
    FROM (
      SELECT value, ordinality AS first_idx
      FROM unnest(result) WITH ORDINALITY AS t(value, ordinality)
    ) ord
    ORDER BY lower(value), first_idx
  ) sub;

  RETURN COALESCE(result, ARRAY[]::text[]);
END;
$$;

-- Apply normalization to all existing rows where it would actually change the value
UPDATE public.crm_contacts
SET tags = public.normalize_crm_multi_array(tags)
WHERE tags IS NOT NULL
  AND tags IS DISTINCT FROM public.normalize_crm_multi_array(tags);

UPDATE public.crm_contacts
SET projects = public.normalize_crm_multi_array(projects)
WHERE projects IS NOT NULL
  AND projects IS DISTINCT FROM public.normalize_crm_multi_array(projects);