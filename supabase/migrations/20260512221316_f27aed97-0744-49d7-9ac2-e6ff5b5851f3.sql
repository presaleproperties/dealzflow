
-- =====================================================================
-- crm_count_delete_scope: preview what soft-deleting these leads touches
-- Returns JSONB: { contacts, notes, tasks, emails, texts, calls,
--                  showings, automations, behavior, total_related,
--                  display_name }
-- p_contact_ids NULL  → returns zeros + display_name only
-- Admin-only.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_count_delete_scope(p_contact_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids       uuid[] := COALESCE(p_contact_ids, ARRAY[]::uuid[]);
  v_contacts  int := 0;
  v_notes     int := 0;
  v_tasks     int := 0;
  v_emails    int := 0;
  v_texts     int := 0;
  v_calls     int := 0;
  v_showings  int := 0;
  v_autom     int := 0;
  v_behavior  int := 0;
  v_name      text;
BEGIN
  IF NOT public.is_crm_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  -- Caller display name (for the type-to-confirm gate)
  SELECT COALESCE(NULLIF(trim(t.display_name), ''), NULLIF(trim(t.name), ''), t.email, 'admin')
    INTO v_name
    FROM public.crm_team t
   WHERE t.user_id = auth.uid()
   LIMIT 1;
  IF v_name IS NULL THEN
    SELECT COALESCE(NULLIF(raw_user_meta_data->>'full_name',''), email, 'admin')
      INTO v_name
      FROM auth.users
     WHERE id = auth.uid();
  END IF;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'contacts', 0, 'notes', 0, 'tasks', 0, 'emails', 0, 'texts', 0,
      'calls', 0, 'showings', 0, 'automations', 0, 'behavior', 0,
      'total_related', 0, 'display_name', v_name
    );
  END IF;

  SELECT count(*) INTO v_contacts FROM public.crm_contacts WHERE id = ANY(v_ids);
  SELECT count(*) INTO v_notes    FROM public.crm_notes    WHERE contact_id = ANY(v_ids);
  SELECT count(*) INTO v_tasks    FROM public.crm_tasks    WHERE contact_id = ANY(v_ids);

  -- Emails: union of send log + thread messages
  SELECT (SELECT count(*) FROM public.crm_email_send_log WHERE contact_id = ANY(v_ids))
       + (SELECT count(*) FROM public.crm_gmail_messages WHERE contact_id = ANY(v_ids))
    INTO v_emails;

  SELECT count(*) INTO v_texts    FROM public.crm_sms_log     WHERE contact_id = ANY(v_ids);
  SELECT count(*) INTO v_calls    FROM public.crm_call_log    WHERE contact_id = ANY(v_ids);
  SELECT count(*) INTO v_showings FROM public.crm_showings    WHERE contact_id = ANY(v_ids);
  SELECT count(*) INTO v_autom    FROM public.crm_automation_enrollments WHERE contact_id = ANY(v_ids);

  SELECT (SELECT count(*) FROM public.crm_lead_behavior_sessions   WHERE contact_id = ANY(v_ids))
       + (SELECT count(*) FROM public.crm_lead_behavior_views      WHERE contact_id = ANY(v_ids))
       + (SELECT count(*) FROM public.crm_lead_behavior_forms      WHERE contact_id = ANY(v_ids))
       + (SELECT count(*) FROM public.crm_lead_behavior_engagement WHERE contact_id = ANY(v_ids))
    INTO v_behavior;

  RETURN jsonb_build_object(
    'contacts',     v_contacts,
    'notes',        v_notes,
    'tasks',        v_tasks,
    'emails',       v_emails,
    'texts',        v_texts,
    'calls',        v_calls,
    'showings',     v_showings,
    'automations',  v_autom,
    'behavior',     v_behavior,
    'total_related', v_notes + v_tasks + v_emails + v_texts + v_calls + v_showings + v_autom + v_behavior,
    'display_name', v_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_count_delete_scope(uuid[]) TO authenticated;

-- =====================================================================
-- crm_soft_delete_contacts_with_undo: soft-delete + capture full row
-- snapshots into a single audit entry's undo_payload so an admin can
-- restore field-for-field if a 30-day Trash purge has run.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_soft_delete_contacts_with_undo(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count        int := 0;
  v_job          uuid := gen_random_uuid();
  v_undo_payload jsonb;
BEGIN
  IF NOT public.is_crm_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Full row snapshot of every contact about to be flagged
  SELECT jsonb_agg(to_jsonb(c.*))
    INTO v_undo_payload
    FROM public.crm_contacts c
   WHERE c.id = ANY(p_ids)
     AND c.deleted_at IS NULL;

  PERFORM set_config('app.skip_audit', 'on', true);
  PERFORM set_config('app.skip_touch', 'on', true);

  UPDATE public.crm_contacts
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = ANY(p_ids)
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.skip_audit', 'off', true);
  PERFORM set_config('app.skip_touch', 'off', true);

  IF v_count > 0 THEN
    PERFORM public.crm_log_bulk_op(
      'bulk_soft_delete',
      v_count,
      jsonb_build_object('ids', p_ids),
      jsonb_build_object(
        'undo_payload', COALESCE(v_undo_payload, '[]'::jsonb),
        'restore_window_days', 30
      ),
      v_job
    );
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_soft_delete_contacts_with_undo(uuid[]) TO authenticated;
