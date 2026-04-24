-- One-time normalization of legacy crm_contacts.city values.
-- Idempotent: safe to re-run; rows already clean stay unchanged.

DO $$
DECLARE
  r RECORD;
  raw_part TEXT;
  cleaned TEXT;
  parts TEXT[];
  out_parts TEXT[];
  seen_lower TEXT[];
  final_value TEXT;
BEGIN
  FOR r IN
    SELECT id, city
    FROM public.crm_contacts
    WHERE city IS NOT NULL AND btrim(city) <> ''
  LOOP
    -- Split on | ; or newline (NOT commas — "Langley, BC" must stay together)
    parts := regexp_split_to_array(r.city, E'\\s*[\\|;\\n\\r]+\\s*');
    out_parts := ARRAY[]::TEXT[];
    seen_lower := ARRAY[]::TEXT[];

    FOREACH raw_part IN ARRAY parts LOOP
      cleaned := btrim(raw_part);
      IF cleaned = '' THEN CONTINUE; END IF;

      -- Drop trailing province/state suffixes (case-insensitive):
      --   ", British Columbia" / ", BC" / ", Bc" etc. and any ", XX" 2-letter code
      cleaned := regexp_replace(
        cleaned,
        '\s*,\s*(british columbia|alberta|ontario|quebec|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland( and labrador)?|prince edward island|yukon|northwest territories|nunavut|[a-z]{2})\s*$',
        '',
        'i'
      );

      -- Strip an appended postal-code fragment (Canadian-style "V3T 0R6" or partial)
      cleaned := regexp_replace(
        cleaned,
        '\s+[a-z]\d[a-z]\s*\d?[a-z]?\d?[a-z]?\s*$',
        '',
        'i'
      );

      -- Trim trailing/leading punctuation and whitespace
      cleaned := btrim(cleaned, E' \t\n\r,;:.|');

      IF cleaned = '' THEN CONTINUE; END IF;

      -- Dedupe case-insensitively (keep first occurrence's casing)
      IF NOT (lower(cleaned) = ANY (seen_lower)) THEN
        out_parts := out_parts || cleaned;
        seen_lower := seen_lower || lower(cleaned);
      END IF;
    END LOOP;

    final_value := NULLIF(array_to_string(out_parts, ' | '), '');

    IF final_value IS DISTINCT FROM r.city THEN
      UPDATE public.crm_contacts
      SET city = final_value
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;