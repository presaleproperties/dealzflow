
ALTER TABLE public.crm_audit_log
  ADD COLUMN IF NOT EXISTS actor_email text;

CREATE INDEX IF NOT EXISTS crm_audit_log_actor_email_idx
  ON public.crm_audit_log (actor_email)
  WHERE actor_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_audit_actor_label(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF(trim(t.display_name), ''),
    NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(u.raw_user_meta_data->>'name'), ''),
    NULLIF(trim(t.email), ''),
    u.email
  )
  FROM auth.users u
  LEFT JOIN public.crm_team t ON t.user_id = u.id
  WHERE u.id = _uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crm_audit_actor_email(_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(trim(t.email), ''), u.email)
  FROM auth.users u
  LEFT JOIN public.crm_team t ON t.user_id = u.id
  WHERE u.id = _uid
  LIMIT 1;
$$;

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
  ELSE
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
      SELECT key FROM jsonb_each(v_after)
       WHERE v_before->key IS DISTINCT FROM v_after->key
         AND key NOT IN ('updated_at')
    ) t;
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.crm_audit_log
    (actor_id, actor_label, actor_email, action, table_name, record_id, before, after, changed_fields)
  VALUES
    (v_actor,
     public.crm_audit_actor_label(v_actor),
     public.crm_audit_actor_email(v_actor),
     v_action, 'crm_contacts',
     COALESCE(NEW.id, OLD.id), v_before, v_after, v_changed);

  RETURN COALESCE(NEW, OLD);
END;
$$;

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
    (actor_id, actor_label, actor_email, action, table_name,
     bulk_job_id, bulk_op, affected_count, filter_snapshot, meta)
  VALUES
    (v_actor,
     public.crm_audit_actor_label(v_actor),
     public.crm_audit_actor_email(v_actor),
     _action, 'crm_contacts',
     v_job, _action, _affected, _filter, COALESCE(_meta, '{}'::jsonb));
  RETURN v_job;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_log_bulk_op(text,int,jsonb,jsonb,uuid) TO authenticated;

UPDATE public.crm_audit_log a
   SET actor_email = COALESCE(a.actor_email, public.crm_audit_actor_email(a.actor_id)),
       actor_label = COALESCE(a.actor_label, public.crm_audit_actor_label(a.actor_id))
 WHERE a.actor_id IS NOT NULL
   AND (a.actor_email IS NULL OR a.actor_label IS NULL);
