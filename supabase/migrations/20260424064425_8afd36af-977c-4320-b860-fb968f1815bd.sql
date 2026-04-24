
CREATE OR REPLACE FUNCTION public.split_imported_note(_raw text, _fallback_ts timestamptz)
 RETURNS TABLE(kind text, body text, event_at timestamptz)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  txt text;
  date_re text := '\(([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s+at\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[APap][Mm])\)';
  event_re text := '([A-Z][A-Za-z''.\- ]+?)\s+(called|texted|emailed|messaged)\s+([A-Z][A-Za-z''.\- ]+?)\s+on\s+(\d{1,2}/\d{1,2}/\d{4})(?:\s+(\d{1,2}:?\d{0,2}\s*[APap][Mm]))?';
  m record;
  prev_end int := 1;
  segment text;
  ts timestamptz;
  k text;
  any_emitted boolean := false;
  positions int[];
  i int;
  match_arr text[];
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN;
  END IF;

  -- Pre-clean: HTML entities, collapse whitespace
  txt := replace(replace(replace(replace(_raw, '&nbsp;', ' '), '&amp;', '&'), E'\r', ' '), E'\n', ' ');
  txt := regexp_replace(txt, '\s+', ' ', 'g');
  txt := btrim(txt);

  -- ===== Pattern A: parenthetical-timestamp segments =====
  -- Walk the string, splitting on each "(Mon DD, YYYY at H:MM:SS AM)" marker.
  -- The text BEFORE each marker is the body for that timestamped entry.
  FOR m IN
    SELECT (regexp_matches(txt, date_re, 'g')) AS arr,
           row_number() OVER () AS rn
  LOOP
    -- Find this match's position in the original text
    DECLARE
      full_match text := format('(%s at %s)', m.arr[1], m.arr[2]);
      pos int;
      end_pos int;
    BEGIN
      pos := strpos(substring(txt FROM prev_end), full_match);
      IF pos = 0 THEN CONTINUE; END IF;
      pos := prev_end + pos - 1;
      end_pos := pos + length(full_match);

      segment := btrim(substring(txt FROM prev_end FOR pos - prev_end));
      -- Strip leading "Notes:" / "Calls:" labels
      segment := regexp_replace(segment, '^(Notes|Calls|Texts|Emails|Tasks|Appointments)\s*:\s*', '', 'i');
      segment := btrim(segment);

      ts := public.parse_note_event_ts(m.arr[1], m.arr[2]);

      IF length(segment) > 0 THEN
        -- Classify segment by keywords
        k := CASE
          WHEN segment ~* '\b(called|voicemail|phoned)\b' THEN 'call'
          WHEN segment ~* '\b(texted|messaged|sms)\b' THEN 'text'
          WHEN segment ~* '\b(emailed|email sent|sent email)\b' THEN 'email'
          WHEN segment ~* '^lead information|automatically updated|via:' THEN 'system'
          ELSE 'note'
        END;

        kind := k;
        body := segment;
        event_at := COALESCE(ts, _fallback_ts);
        any_emitted := true;
        RETURN NEXT;
      END IF;

      prev_end := end_pos + 1;
    END;
  END LOOP;

  -- Trailing segment after the last timestamp
  IF prev_end <= length(txt) THEN
    segment := btrim(substring(txt FROM prev_end));
    segment := regexp_replace(segment, '^(Notes|Calls|Texts|Emails|Tasks|Appointments)\s*:\s*', '', 'i');
    segment := btrim(segment);
    IF length(segment) > 10 THEN
      kind := 'note';
      body := segment;
      event_at := _fallback_ts;
      any_emitted := true;
      RETURN NEXT;
    END IF;
  END IF;

  -- ===== Pattern B: "Name verb Name on MM/DD/YYYY" person events =====
  -- Only run if Pattern A didn't already cover everything
  IF NOT any_emitted THEN
    FOR m IN
      SELECT (regexp_matches(txt, event_re, 'g')) AS arr
    LOOP
      k := CASE m.arr[2]
             WHEN 'called'   THEN 'call'
             WHEN 'texted'   THEN 'text'
             WHEN 'emailed'  THEN 'email'
             WHEN 'messaged' THEN 'text'
             ELSE 'note'
           END;
      ts := public.parse_note_event_ts(m.arr[4], m.arr[5]);
      kind := k;
      body := format('%s %s %s', m.arr[1], m.arr[2], m.arr[3]);
      event_at := COALESCE(ts, _fallback_ts);
      any_emitted := true;
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Fallback: emit the whole thing as one note
  IF NOT any_emitted THEN
    kind := 'note';
    body := txt;
    event_at := _fallback_ts;
    RETURN NEXT;
  END IF;
END;
$function$;
