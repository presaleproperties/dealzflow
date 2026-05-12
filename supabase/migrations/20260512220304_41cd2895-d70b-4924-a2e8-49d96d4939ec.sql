-- ============================================================
-- Phase 1.5: Soft-delete + Audit log + Exports bucket
-- ============================================================

-- 1. Soft-delete columns on crm_contacts
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS crm_contacts_deleted_at_idx
  ON public.crm_contacts (deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. Update crm_can_see_contact_id: hide soft-deleted from non-admins
CREATE OR REPLACE FUNCTION public.crm_can_see_contact_id(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN (SELECT deleted_at FROM public.crm_contacts WHERE id = _contact_id) IS NOT NULL
        THEN public.is_crm_admin_or_owner(_user_id)
      ELSE public.crm_can_see_contact(
        _user_id,
        (SELECT assigned_to FROM public.crm_contacts WHERE id = _contact_id)
      )
    END;
$function$;

-- ============================================================
-- 3. Audit log table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  before jsonb,
  after jsonb,
  changed_fields text[],
  bulk_job_id uuid,
  bulk_op text,
  affected_count int,
  filter_snapshot jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS crm_audit_log_occurred_at_idx ON public.crm_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_audit_log_record_id_idx   ON public.crm_audit_log (record_id) WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_audit_log_actor_idx       ON public.crm_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS crm_audit_log_bulk_job_idx    ON public.crm_audit_log (bulk_job_id) WHERE bulk_job_id IS NOT NULL;

ALTER TABLE public.crm_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: admins see all; actors see their own; record-scoped view if caller can see contact
CREATE POLICY "audit_select_admin_or_owner"
  ON public.crm_audit_log FOR SELECT
  USING (
    public.is_crm_admin_or_owner(auth.uid())
    OR actor_id = auth.uid()
    OR (record_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), record_id))
  );

-- No INSERT/UPDATE/DELETE policies: writes happen via SECURITY DEFINER helpers + triggers only

-- ============================================================
-- 4. Helper to resolve actor_label
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_audit_actor_label(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT display_name FROM public.crm_team WHERE user_id = _uid LIMIT 1;
$$;

-- ============================================================
-- 5. Trigger function for crm_contacts mutations
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_audit_contacts_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_skip text;
  v_actor uuid;
  v_action text;
  v_changed text[];
  v_before jsonb;
  v_after  jsonb;
BEGIN
  -- Allow opt-out (matches app.skip_touch precedent)
  BEGIN
    v_skip := current_setting('app.skip_audit', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_after  := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := to_jsonb(OLD);
  ELSE -- UPDATE
    -- Soft-delete / restore detection
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'soft_delete';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_action := 'restore';
    ELSE
      v_action := 'update';
    END IF;
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed
    FROM (
      SELECT key
      FROM jsonb_each(v_after)
      WHERE v_before->key IS DISTINCT FROM v_after->key
        AND key NOT IN ('updated_at')
    ) t;
    -- Skip noise-only updates
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.crm_audit_log
    (actor_id, actor_label, action, table_name, record_id, before, after, changed_fields)
  VALUES
    (v_actor, public.crm_audit_actor_label(v_actor), v_action, 'crm_contacts',
     COALESCE(NEW.id, OLD.id), v_before, v_after, v_changed);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS crm_audit_contacts_trg ON public.crm_contacts;
CREATE TRIGGER crm_audit_contacts_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_audit_contacts_trg();

-- ============================================================
-- 6. Bulk op logger
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_log_bulk_op(
  _action text,
  _affected int,
  _filter jsonb DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb,
  _job_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_job uuid := COALESCE(_job_id, gen_random_uuid());
  v_actor uuid := auth.uid();
BEGIN
  INSERT INTO public.crm_audit_log
    (actor_id, actor_label, action, table_name, bulk_job_id, bulk_op, affected_count, filter_snapshot, meta)
  VALUES
    (v_actor, public.crm_audit_actor_label(v_actor), _action, 'crm_contacts',
     v_job, _action, _affected, _filter, COALESCE(_meta,'{}'::jsonb));
  RETURN v_job;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_log_bulk_op(text,int,jsonb,jsonb,uuid) TO authenticated;

-- ============================================================
-- 7. Trash RPCs (admin-only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_soft_delete_contacts(_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_job uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_crm_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  -- Per-row trigger writes individual audit rows; tag them by setting bulk_job
  PERFORM set_config('app.skip_audit','on', true);
  UPDATE public.crm_contacts
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = ANY(_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.skip_audit','off', true);
  PERFORM public.crm_log_bulk_op('bulk_soft_delete', v_count,
    jsonb_build_object('ids', _ids), '{}'::jsonb, v_job);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_restore_contacts(_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_job uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_crm_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  PERFORM set_config('app.skip_audit','on', true);
  UPDATE public.crm_contacts
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = ANY(_ids) AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.skip_audit','off', true);
  PERFORM public.crm_log_bulk_op('bulk_restore', v_count,
    jsonb_build_object('ids', _ids), '{}'::jsonb, v_job);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_hard_delete_contacts(_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_job uuid := gen_random_uuid();
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_crm_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  -- Snapshot basic identifying info before delete for audit
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', first_name||' '||last_name, 'email', email, 'phone', phone
  ))
  INTO v_snapshot
  FROM public.crm_contacts
  WHERE id = ANY(_ids) AND deleted_at IS NOT NULL;

  PERFORM set_config('app.skip_audit','on', true);
  DELETE FROM public.crm_contacts
   WHERE id = ANY(_ids) AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.skip_audit','off', true);

  PERFORM public.crm_log_bulk_op('bulk_hard_delete', v_count,
    jsonb_build_object('ids', _ids), jsonb_build_object('snapshot', v_snapshot), v_job);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_soft_delete_contacts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_restore_contacts(uuid[])     TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_hard_delete_contacts(uuid[]) TO authenticated;

-- ============================================================
-- 8. Purge function (for cron / edge fn)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_purge_trash(_older_than interval DEFAULT interval '30 days')
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_job uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('app.skip_audit','on', true);
  DELETE FROM public.crm_contacts
   WHERE deleted_at IS NOT NULL AND deleted_at < (now() - _older_than);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.skip_audit','off', true);

  IF v_count > 0 THEN
    PERFORM public.crm_log_bulk_op('purge', v_count,
      jsonb_build_object('older_than', _older_than::text), '{}'::jsonb, v_job);
  END IF;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 9. Exports bucket (private, signed-URL only)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-exports', 'crm-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Only admins/owners can read or write objects in crm-exports
CREATE POLICY "crm_exports_admin_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'crm-exports' AND public.is_crm_admin_or_owner(auth.uid()));

CREATE POLICY "crm_exports_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'crm-exports' AND public.is_crm_admin_or_owner(auth.uid()));

CREATE POLICY "crm_exports_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'crm-exports' AND public.is_crm_admin_or_owner(auth.uid()));