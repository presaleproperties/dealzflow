
-- S3: Silent bulk update (skips last_touch_at trigger)
CREATE OR REPLACE FUNCTION public.bulk_update_contacts_silent(
  p_contact_ids uuid[],
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_visible uuid[];
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Tell the last_touch trigger to leave last_touch_at alone for this txn.
  PERFORM set_config('app.skip_touch', 'on', true);

  -- Filter to contacts the caller is allowed to see (RLS-equivalent gate).
  SELECT array_agg(c.id) INTO v_visible
  FROM crm_contacts c
  WHERE c.id = ANY(p_contact_ids)
    AND (
      is_crm_admin(auth.uid())
      OR crm_can_see_contact_id(auth.uid(), c.id)
    );

  IF v_visible IS NULL OR array_length(v_visible, 1) IS NULL THEN
    PERFORM set_config('app.skip_touch', 'off', true);
    RETURN 0;
  END IF;

  UPDATE crm_contacts
  SET
    tags         = COALESCE((p_updates->'tags')::text[]::text[]::text[],  tags),
    projects     = COALESCE((p_updates->'projects')::text[]::text[]::text[], projects),
    assigned_to  = COALESCE(NULLIF(p_updates->>'assigned_to',''), assigned_to),
    status       = COALESCE(NULLIF(p_updates->>'status',''), status),
    lead_type    = COALESCE(NULLIF(p_updates->>'lead_type',''), lead_type),
    contact_type = COALESCE(NULLIF(p_updates->>'contact_type',''), contact_type),
    updated_at   = now()
  WHERE id = ANY(v_visible);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.skip_touch', 'off', true);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_contacts_silent(uuid[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_update_contacts_silent(uuid[], jsonb) TO authenticated;

-- S9: Bulk delete in a single transaction
CREATE OR REPLACE FUNCTION public.crm_bulk_delete_contacts(
  p_contact_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visible uuid[];
  v_deleted integer := 0;
  v_blocked integer := 0;
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'blocked', 0);
  END IF;

  -- Permission filter: admins or assigned visibility
  SELECT array_agg(c.id) INTO v_visible
  FROM crm_contacts c
  WHERE c.id = ANY(p_contact_ids)
    AND (
      is_crm_admin(auth.uid())
      OR crm_can_see_contact_id(auth.uid(), c.id)
    );

  IF v_visible IS NULL THEN v_visible := ARRAY[]::uuid[]; END IF;
  v_blocked := COALESCE(array_length(p_contact_ids, 1), 0)
             - COALESCE(array_length(v_visible, 1), 0);

  IF array_length(v_visible, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'blocked', v_blocked);
  END IF;

  PERFORM set_config('app.skip_touch', 'on', true);

  -- Wipe child rows first so foreign keys don't block us.
  DELETE FROM crm_activity_events WHERE contact_id = ANY(v_visible);
  DELETE FROM crm_timeline_pins   WHERE contact_id = ANY(v_visible);
  DELETE FROM crm_contacts        WHERE id = ANY(v_visible);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  PERFORM set_config('app.skip_touch', 'off', true);

  RETURN jsonb_build_object('deleted', v_deleted, 'blocked', v_blocked);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_bulk_delete_contacts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_bulk_delete_contacts(uuid[]) TO authenticated;
