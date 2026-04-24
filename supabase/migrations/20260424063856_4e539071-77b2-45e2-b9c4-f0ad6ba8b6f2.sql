
-- 1. Add event_at column for true event timestamp (separate from row created_at)
ALTER TABLE public.crm_notes
  ADD COLUMN IF NOT EXISTS event_at timestamptz;

UPDATE public.crm_notes SET event_at = created_at WHERE event_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_notes_contact_event_at
  ON public.crm_notes (contact_id, event_at DESC);

-- 2. Helper: parse a date-time fragment like "12/24/2022 12:51pm" or "12/24/2022" into timestamptz
CREATE OR REPLACE FUNCTION public.parse_note_event_ts(_date text, _time text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d date;
  t time;
  ampm text;
  h int;
  m int;
  cleaned_time text;
BEGIN
  IF _date IS NULL OR btrim(_date) = '' THEN RETURN NULL; END IF;

  BEGIN
    d := to_date(btrim(_date), 'FMMM/FMDD/YYYY');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      d := to_date(btrim(_date), 'Mon FMDD, YYYY');
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END;

  IF _time IS NULL OR btrim(_time) = '' THEN
    RETURN (d::timestamp)::timestamptz;
  END IF;

  cleaned_time := lower(regexp_replace(btrim(_time), '\s+', '', 'g'));
  ampm := substring(cleaned_time FROM '(am|pm)$');
  cleaned_time := regexp_replace(cleaned_time, '(am|pm)$', '');

  BEGIN
    h := split_part(cleaned_time, ':', 1)::int;
    m := COALESCE(NULLIF(split_part(cleaned_time, ':', 2), '')::int, 0);
  EXCEPTION WHEN OTHERS THEN
    RETURN (d::timestamp)::timestamptz;
  END;

  IF ampm = 'pm' AND h < 12 THEN h := h + 12; END IF;
  IF ampm = 'am' AND h = 12 THEN h := 0; END IF;

  RETURN ((d::timestamp) + make_interval(hours => h, mins => m))::timestamptz;
END;
$$;

-- 3. Core parser: takes raw imported note blob, returns set of (kind, body, event_at)
CREATE OR REPLACE FUNCTION public.split_imported_note(_raw text, _fallback_ts timestamptz)
RETURNS TABLE(kind text, body text, event_at timestamptz)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  txt text;
  match record;
  date_re text := '\(([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s+at\s+(\d{1,2}:\d{2}:\d{2}\s*[APap][Mm])\)';
  event_re text := '([A-Z][A-Za-z''.\- ]+?)\s+(called|texted|emailed|messaged)\s+([A-Z][A-Za-z''.\- ]+?)\s+on\s+(\d{1,2}/\d{1,2}/\d{4})(?:\s+(\d{1,2}:?\d{0,2}\s*[APap][Mm]))?';
  signature_re text := '-([A-Z][A-Za-z''.\- ]+?)\s+(\d{1,2}/\d{1,2}/\d{4})';
  ts timestamptz;
  k text;
  b text;
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN;
  END IF;

  -- Pre-clean: collapse whitespace, decode common HTML entities
  txt := replace(replace(replace(_raw, '&nbsp;', ' '), '&amp;', '&'), E'\r', ' ');
  txt := regexp_replace(txt, '\s+', ' ', 'g');

  -- Split into discrete events: "Name verb Name on MM/DD/YYYY [time]"
  FOR match IN
    SELECT m[1] AS sender, m[2] AS verb, m[3] AS receiver, m[4] AS d, m[5] AS t,
           idx, start_pos
    FROM (
      SELECT regexp_matches(txt, event_re, 'g') AS m,
             row_number() OVER () AS idx,
             0 AS start_pos
    ) sub
  LOOP
    k := CASE match.verb
           WHEN 'called'   THEN 'call'
           WHEN 'texted'   THEN 'text'
           WHEN 'emailed'  THEN 'email'
           WHEN 'messaged' THEN 'text'
           ELSE 'note'
         END;
    ts := public.parse_note_event_ts(match.d, match.t);
    b := format('%s %s %s', match.sender, match.verb, match.receiver);

    kind := k;
    body := b;
    event_at := COALESCE(ts, _fallback_ts);
    RETURN NEXT;
  END LOOP;

  -- Extract the "(Mon DD, YYYY at HH:MM:SS AM/PM)" timestamps as system entries
  FOR match IN
    SELECT m[1] AS d, m[2] AS t
    FROM (SELECT regexp_matches(txt, date_re, 'g') AS m) sub
  LOOP
    ts := public.parse_note_event_ts(match.d, match.t);
    IF ts IS NOT NULL THEN
      kind := 'system';
      body := 'Lead information updated via import';
      event_at := ts;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Extract signed notes "...-Name MM/DD/YYYY"
  FOR match IN
    SELECT m[1] AS author, m[2] AS d
    FROM (SELECT regexp_matches(txt, signature_re, 'g') AS m) sub
  LOOP
    ts := public.parse_note_event_ts(match.d, NULL);
    kind := 'note';
    body := format('Note logged by %s', btrim(match.author));
    event_at := COALESCE(ts, _fallback_ts);
    RETURN NEXT;
  END LOOP;

  -- If we found nothing parseable, return the original as a single note
  IF NOT FOUND THEN
    kind := 'note';
    body := txt;
    event_at := _fallback_ts;
    RETURN NEXT;
  END IF;
END;
$$;

-- 4. Backfill: archive existing long imported notes & insert split versions
DO $$
DECLARE
  rec record;
  parsed record;
  inserted_count int := 0;
  archived_count int := 0;
BEGIN
  FOR rec IN
    SELECT id, contact_id, user_id, content, created_at
    FROM public.crm_notes
    WHERE note_type IN ('import', 'imported')
      AND length(content) > 250
      AND content ~ '(called|texted|emailed|messaged)\s+[A-Z]'
  LOOP
    -- Insert split entries
    FOR parsed IN
      SELECT * FROM public.split_imported_note(rec.content, rec.created_at)
    LOOP
      IF parsed.body IS NOT NULL AND length(btrim(parsed.body)) > 0 THEN
        INSERT INTO public.crm_notes (contact_id, user_id, content, note_type, event_at, is_pinned, created_at)
        VALUES (
          rec.contact_id,
          rec.user_id,
          btrim(parsed.body),
          parsed.kind,
          parsed.event_at,
          false,
          rec.created_at
        );
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;

    -- Archive the original (hidden type, un-pinned)
    UPDATE public.crm_notes
    SET note_type = 'import_archive',
        is_pinned = false
    WHERE id = rec.id;
    archived_count := archived_count + 1;
  END LOOP;

  RAISE NOTICE 'Note backfill: archived % originals, inserted % split entries', archived_count, inserted_count;
END;
$$;

-- 5. Auto-split trigger for future imports
CREATE OR REPLACE FUNCTION public.auto_split_imported_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parsed record;
  any_event boolean := false;
BEGIN
  -- Only act on import notes that look like multi-event blobs
  IF NEW.note_type NOT IN ('import', 'imported') THEN
    NEW.event_at := COALESCE(NEW.event_at, NEW.created_at, now());
    RETURN NEW;
  END IF;

  IF NEW.content IS NULL
     OR length(NEW.content) < 250
     OR NEW.content !~ '(called|texted|emailed|messaged)\s+[A-Z]' THEN
    NEW.event_at := COALESCE(NEW.event_at, NEW.created_at, now());
    RETURN NEW;
  END IF;

  -- Insert split children, then mark this row as archive (kept but hidden)
  FOR parsed IN
    SELECT * FROM public.split_imported_note(NEW.content, COALESCE(NEW.created_at, now()))
  LOOP
    IF parsed.body IS NOT NULL AND length(btrim(parsed.body)) > 0 THEN
      INSERT INTO public.crm_notes (contact_id, user_id, content, note_type, event_at, is_pinned, created_at)
      VALUES (
        NEW.contact_id,
        NEW.user_id,
        btrim(parsed.body),
        parsed.kind,
        parsed.event_at,
        false,
        COALESCE(NEW.created_at, now())
      );
      any_event := true;
    END IF;
  END LOOP;

  -- Demote the original to archive so it doesn't show in the timeline
  IF any_event THEN
    NEW.note_type := 'import_archive';
    NEW.is_pinned := false;
  END IF;

  NEW.event_at := COALESCE(NEW.event_at, NEW.created_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_split_imported_note ON public.crm_notes;
CREATE TRIGGER trg_auto_split_imported_note
BEFORE INSERT ON public.crm_notes
FOR EACH ROW
EXECUTE FUNCTION public.auto_split_imported_note();
