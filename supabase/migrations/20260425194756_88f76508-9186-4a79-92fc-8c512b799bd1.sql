
-- Returns duplicate groups with enriched contact details for the review screen.
-- match_type values come from crm_potential_duplicates view.
CREATE OR REPLACE FUNCTION public.list_potential_duplicates(_limit INT DEFAULT 100)
RETURNS TABLE (
  match_key TEXT,
  match_type TEXT,
  dup_count BIGINT,
  contacts JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.match_key,
    d.match_type,
    d.dup_count,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'first_name', c.first_name,
          'last_name', c.last_name,
          'email', c.email,
          'phone', c.phone,
          'source', c.source,
          'status', c.status,
          'assigned_to', c.assigned_to,
          'created_at', c.created_at,
          'last_touch_at', c.last_touch_at,
          'tags', c.tags,
          'projects', c.projects,
          'lead_type', c.lead_type
        )
        ORDER BY c.last_touch_at DESC NULLS LAST, c.created_at DESC
      )
      FROM public.crm_contacts c
      WHERE c.id = ANY(d.contact_ids)
    ) AS contacts
  FROM public.crm_potential_duplicates d
  WHERE public.is_crm_member(auth.uid())
  ORDER BY d.dup_count DESC, d.match_key
  LIMIT GREATEST(_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.list_potential_duplicates(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_potential_duplicates(INT) TO authenticated;


-- Merges loser contacts into a winner. Re-points every related row, then deletes losers.
-- Returns counts so the UI can confirm what happened.
CREATE OR REPLACE FUNCTION public.merge_crm_contacts(
  _winner_id UUID,
  _loser_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _winner public.crm_contacts%ROWTYPE;
  _loser public.crm_contacts%ROWTYPE;
  _moved_notes INT := 0;
  _moved_tasks INT := 0;
  _moved_showings INT := 0;
  _moved_messages INT := 0;
  _moved_emails INT := 0;
  _merged_tags TEXT[];
  _merged_projects TEXT[];
  _merged_notes_text TEXT;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM admins can merge contacts';
  END IF;

  IF _winner_id IS NULL OR _loser_ids IS NULL OR array_length(_loser_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Winner and at least one loser are required';
  END IF;

  IF _winner_id = ANY(_loser_ids) THEN
    RAISE EXCEPTION 'Winner cannot also be a loser';
  END IF;

  SELECT * INTO _winner FROM public.crm_contacts WHERE id = _winner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Winner contact not found';
  END IF;

  -- Walk each loser, fold its data into the winner
  FOR _loser IN SELECT * FROM public.crm_contacts WHERE id = ANY(_loser_ids) LOOP
    -- Backfill simple fields from loser if winner is empty
    UPDATE public.crm_contacts
       SET email             = COALESCE(NULLIF(_winner.email, ''),             _loser.email),
           email_secondary   = COALESCE(NULLIF(_winner.email_secondary, ''),   _loser.email_secondary),
           phone             = COALESCE(NULLIF(_winner.phone, ''),             _loser.phone),
           phone_secondary   = COALESCE(NULLIF(_winner.phone_secondary, ''),   _loser.phone_secondary),
           address           = COALESCE(NULLIF(_winner.address, ''),           _loser.address),
           city              = COALESCE(NULLIF(_winner.city, ''),              _loser.city),
           province          = COALESCE(NULLIF(_winner.province, ''),          _loser.province),
           postal_code       = COALESCE(NULLIF(_winner.postal_code, ''),       _loser.postal_code),
           source            = COALESCE(NULLIF(_winner.source, ''),            _loser.source),
           assigned_to       = COALESCE(NULLIF(_winner.assigned_to, ''),       _loser.assigned_to),
           project           = COALESCE(NULLIF(_winner.project, ''),           _loser.project),
           lead_type         = COALESCE(NULLIF(_winner.lead_type, ''),         _loser.lead_type),
           language          = COALESCE(NULLIF(_winner.language, ''),          _loser.language),
           bedrooms_preferred= COALESCE(NULLIF(_winner.bedrooms_preferred, ''),_loser.bedrooms_preferred),
           budget_min        = COALESCE(_winner.budget_min,                    _loser.budget_min),
           budget_max        = COALESCE(_winner.budget_max,                    _loser.budget_max),
           co_buyer_name     = COALESCE(NULLIF(_winner.co_buyer_name, ''),     _loser.co_buyer_name),
           co_buyer_phone    = COALESCE(NULLIF(_winner.co_buyer_phone, ''),    _loser.co_buyer_phone),
           co_buyer_email    = COALESCE(NULLIF(_winner.co_buyer_email, ''),    _loser.co_buyer_email),
           updated_at        = now()
     WHERE id = _winner_id;

    -- Refresh winner snapshot for next iteration
    SELECT * INTO _winner FROM public.crm_contacts WHERE id = _winner_id;
  END LOOP;

  -- Union arrays (tags, projects)
  SELECT ARRAY(
    SELECT DISTINCT t FROM (
      SELECT unnest(COALESCE(_winner.tags, ARRAY[]::TEXT[])) AS t
      UNION
      SELECT unnest(COALESCE(c.tags, ARRAY[]::TEXT[])) AS t
        FROM public.crm_contacts c WHERE c.id = ANY(_loser_ids)
    ) s WHERE t IS NOT NULL AND t <> ''
  ) INTO _merged_tags;

  SELECT ARRAY(
    SELECT DISTINCT p FROM (
      SELECT unnest(COALESCE(_winner.projects, ARRAY[]::TEXT[])) AS p
      UNION
      SELECT unnest(COALESCE(c.projects, ARRAY[]::TEXT[])) AS p
        FROM public.crm_contacts c WHERE c.id = ANY(_loser_ids)
    ) s WHERE p IS NOT NULL AND p <> ''
  ) INTO _merged_projects;

  -- Concatenate notes (free-text column on the contact)
  SELECT string_agg(NULLIF(trim(n), ''), E'\n\n---\n\n')
    FROM (
      SELECT _winner.notes AS n
      UNION ALL
      SELECT c.notes FROM public.crm_contacts c WHERE c.id = ANY(_loser_ids)
    ) s
  INTO _merged_notes_text;

  UPDATE public.crm_contacts
     SET tags     = _merged_tags,
         projects = _merged_projects,
         notes    = _merged_notes_text,
         updated_at = now()
   WHERE id = _winner_id;

  -- Re-point related rows to the winner
  WITH u AS (
    UPDATE public.crm_notes SET contact_id = _winner_id
     WHERE contact_id = ANY(_loser_ids) RETURNING 1
  ) SELECT count(*) INTO _moved_notes FROM u;

  WITH u AS (
    UPDATE public.crm_tasks SET contact_id = _winner_id
     WHERE contact_id = ANY(_loser_ids) RETURNING 1
  ) SELECT count(*) INTO _moved_tasks FROM u;

  WITH u AS (
    UPDATE public.crm_showings SET contact_id = _winner_id
     WHERE contact_id = ANY(_loser_ids) RETURNING 1
  ) SELECT count(*) INTO _moved_showings FROM u;

  -- These tables exist in this CRM; guard with EXCEPTION block in case any are absent.
  BEGIN
    WITH u AS (
      UPDATE public.crm_messages SET contact_id = _winner_id
       WHERE contact_id = ANY(_loser_ids) RETURNING 1
    ) SELECT count(*) INTO _moved_messages FROM u;
  EXCEPTION WHEN undefined_table THEN _moved_messages := 0;
  END;

  BEGIN
    WITH u AS (
      UPDATE public.crm_email_log SET contact_id = _winner_id
       WHERE contact_id = ANY(_loser_ids) RETURNING 1
    ) SELECT count(*) INTO _moved_emails FROM u;
  EXCEPTION WHEN undefined_table THEN _moved_emails := 0;
  END;

  -- Add an audit note on the winner
  INSERT INTO public.crm_notes (contact_id, user_id, content, note_type)
  VALUES (
    _winner_id,
    auth.uid(),
    format('Merged %s duplicate contact(s) into this record. Notes/tasks/showings/messages reassigned.', array_length(_loser_ids, 1)),
    'system'
  );

  -- Finally remove the loser contacts
  DELETE FROM public.crm_contacts WHERE id = ANY(_loser_ids);

  RETURN jsonb_build_object(
    'winner_id', _winner_id,
    'losers_removed', array_length(_loser_ids, 1),
    'moved_notes', _moved_notes,
    'moved_tasks', _moved_tasks,
    'moved_showings', _moved_showings,
    'moved_messages', _moved_messages,
    'moved_emails', _moved_emails
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_crm_contacts(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_crm_contacts(UUID, UUID[]) TO authenticated;
