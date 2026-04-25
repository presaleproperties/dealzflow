CREATE OR REPLACE FUNCTION public.format_note_content(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  IF _raw IS NULL OR length(_raw) < 50 THEN
    RETURN _raw;
  END IF;

  s := replace(replace(_raw, E'\r\n', E'\n'), E'\r', E'\n');

  -- Only reformat if it looks like a dense blob
  IF length(s) < 200
     AND s !~ '(called|texted|emailed|messaged)\s+[A-Z]'
     AND s !~ '\([A-Za-z]{3}\s+\d{1,2},\s*\d{4}\s+at\s+\d{1,2}:\d{2}'
     AND s !~ '(Notes|Calls|Texts|Emails|Tasks|Appointments|Lead Information|Source):' THEN
    RETURN _raw;
  END IF;

  -- 0a. Fix punctuation glue: ".A" -> ". A"
  s := regexp_replace(s, '([.!?])([A-Z])', E'\\1 \\2', 'g');
  -- 0b. Fix lowercase→Capital glue: "wordWord" -> "word Word"
  s := regexp_replace(s, '([a-z])([A-Z][a-z])', E'\\1 \\2', 'g');

  -- 0c. Normalize === HEADER === markers
  s := regexp_replace(s, '\s*===\s*([^=]+?)\s*===\s*', E'\n\n— \\1 —\n', 'g');

  -- 1. Section labels onto their own line
  s := regexp_replace(s, '(^|[^\n])(Notes|Calls|Texts|Emails|Tasks|Appointments|Lead Information|Source):\s*', E'\\1\n\n\\2:\n', 'g');

  -- 1b. Inline metadata fields onto their own lines
  s := regexp_replace(
    s,
    '([^\n\w])(Name|Email|Phone|Lead Type|Stage|Owner|Group|Location|Price|Property|Visitor ID|Intent Score|City Interest|Project Interest|Last Seen|Referrer|Behavior Summary|Page|Landed on|Exited on|Link):\s*',
    E'\\1\n\\2: ',
    'g'
  );

  -- 2. Person events as bullets: "X called/texted/emailed/messaged Y on MM/DD/YYYY"
  s := regexp_replace(
    s,
    '([^\n])\s+([A-Z][A-Za-z''.\-]+(?:\s+[A-Z][A-Za-z''.\-]+){0,3})\s+(called|texted|emailed|messaged)\s+',
    E'\\1\n• \\2 \\3 ',
    'g'
  );

  -- 3. Parenthetical timestamps onto own indented line
  s := regexp_replace(
    s,
    '\s*\(([A-Za-z]{3}\s+\d{1,2},\s*\d{4}\s+at\s+\d{1,2}:\d{2}(?::\d{2})?\s*[APap][Mm])\)',
    E'\n  ↳ (\\1)',
    'g'
  );

  -- 4. Collapse 3+ newlines, trim trailing whitespace per line
  s := regexp_replace(s, E'\n{3,}', E'\n\n', 'g');
  s := regexp_replace(s, E'[ \t]+\n', E'\n', 'g');
  s := btrim(s);

  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_reformat_crm_notes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_changed int;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    -- Allow service role / direct calls too; only block authenticated non-admins
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Only CRM admins can run note reformat';
    END IF;
  END IF;

  WITH candidates AS (
    SELECT id, content, public.format_note_content(content) AS new_content
    FROM public.crm_notes
    WHERE content_original IS NULL
      AND content IS NOT NULL
      AND length(content) > 50
  ),
  upd AS (
    UPDATE public.crm_notes c
       SET content_original = cand.content,
           content = cand.new_content,
           updated_at = now()
      FROM candidates cand
     WHERE c.id = cand.id
       AND cand.new_content IS DISTINCT FROM cand.content
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM candidates), (SELECT count(*) FROM upd) INTO v_total, v_changed;

  RETURN jsonb_build_object('candidates', v_total, 'updated', v_changed, 'ran_at', now());
END;
$$;