
-- =====================================================================
-- 1. Enrollments table (in-flight progress per lead per automation)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_automation_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',         -- active | completed | exited | failed
  current_step_order integer NOT NULL DEFAULT 1,
  next_step_due_at timestamptz DEFAULT now(),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  exit_reason text,
  trigger_data jsonb,
  project_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_auto_enroll_due_idx
  ON public.crm_automation_enrollments (next_step_due_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS crm_auto_enroll_contact_idx
  ON public.crm_automation_enrollments (contact_id);
CREATE INDEX IF NOT EXISTS crm_auto_enroll_auto_idx
  ON public.crm_automation_enrollments (automation_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_auto_enroll_active_uniq
  ON public.crm_automation_enrollments (automation_id, contact_id)
  WHERE status = 'active';

ALTER TABLE public.crm_automation_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM admins read enrollments"
  ON public.crm_automation_enrollments FOR SELECT
  TO authenticated USING (public.is_crm_admin(auth.uid()));
CREATE POLICY "CRM admins manage enrollments"
  ON public.crm_automation_enrollments FOR ALL
  TO authenticated USING (public.is_crm_admin(auth.uid()))
  WITH CHECK (public.is_crm_admin(auth.uid()));

CREATE TRIGGER trg_crm_auto_enroll_updated_at
  BEFORE UPDATE ON public.crm_automation_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 2. Per-step run log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_automation_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid REFERENCES public.crm_automation_enrollments(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  contact_id uuid,
  step_order integer NOT NULL,
  action_type text NOT NULL,
  action_result text NOT NULL DEFAULT 'success', -- success | error | skipped
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_auto_runlog_auto_created_idx
  ON public.crm_automation_run_log (automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_auto_runlog_enroll_idx
  ON public.crm_automation_run_log (enrollment_id, step_order);

ALTER TABLE public.crm_automation_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM admins read run log"
  ON public.crm_automation_run_log FOR SELECT
  TO authenticated USING (public.is_crm_admin(auth.uid()));

-- =====================================================================
-- 3. Migrate existing in-flight rows from legacy crm_automation_logs
-- =====================================================================
INSERT INTO public.crm_automation_enrollments
  (id, automation_id, contact_id, status, current_step_order,
   next_step_due_at, enrolled_at, exited_at, exit_reason, trigger_data, project_slug)
SELECT
  id, automation_id, contact_id,
  COALESCE(status, 'active'),
  COALESCE(current_step_order, 1),
  next_step_due_at, COALESCE(enrolled_at, created_at),
  exited_at, exit_reason, trigger_data, project_slug
FROM public.crm_automation_logs
WHERE contact_id IS NOT NULL
  AND status IN ('active','completed','exited','failed')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. enroll_in_automation: idempotent enrollment fn
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enroll_in_automation(
  p_automation_id uuid,
  p_contact_id uuid,
  p_trigger_data jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_active boolean;
  v_first_delay int;
  v_new_id uuid;
BEGIN
  -- Auto must be active
  SELECT is_active INTO v_active FROM crm_automations WHERE id = p_automation_id;
  IF NOT FOUND OR v_active IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Skip if already actively enrolled
  SELECT id INTO v_existing
    FROM crm_automation_enrollments
   WHERE automation_id = p_automation_id
     AND contact_id    = p_contact_id
     AND status        = 'active'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- First step's delay
  SELECT COALESCE(delay_hours, 0) INTO v_first_delay
    FROM crm_automation_steps
   WHERE automation_id = p_automation_id
   ORDER BY step_order ASC
   LIMIT 1;

  INSERT INTO crm_automation_enrollments
    (automation_id, contact_id, status, current_step_order,
     next_step_due_at, trigger_data)
  VALUES
    (p_automation_id, p_contact_id, 'active', 1,
     now() + make_interval(hours => COALESCE(v_first_delay, 0)),
     COALESCE(p_trigger_data, '{}'::jsonb))
  RETURNING id INTO v_new_id;

  -- Stat bump
  UPDATE crm_automations
     SET total_enrolled = COALESCE(total_enrolled, 0) + 1
   WHERE id = p_automation_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_in_automation(uuid, uuid, jsonb) TO authenticated;

-- =====================================================================
-- 5. Trigger fns on crm_contacts
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_crm_contacts_auto_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_src text;
BEGIN
  FOR r IN
    SELECT id, COALESCE(trigger_config, '{}'::jsonb) AS cfg
      FROM crm_automations
     WHERE is_active = true
       AND trigger_type = 'new_lead'
  LOOP
    v_src := NULLIF(r.cfg->>'source', '');
    IF v_src IS NULL OR v_src = 'any' OR v_src = NEW.source THEN
      PERFORM enroll_in_automation(r.id, NEW.id,
        jsonb_build_object('event', 'new_lead', 'source', NEW.source));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_crm_contacts_auto_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT id, COALESCE(trigger_config, '{}'::jsonb) AS cfg
      FROM crm_automations
     WHERE is_active = true
       AND trigger_type = 'status_change'
  LOOP
    v_status := NULLIF(r.cfg->>'status', '');
    IF v_status IS NULL OR v_status = NEW.status THEN
      PERFORM enroll_in_automation(r.id, NEW.id,
        jsonb_build_object('event','status_change','from',OLD.status,'to',NEW.status));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_crm_contacts_auto_tag_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_tag text;
  added text[];
BEGIN
  IF NEW.tags IS NULL THEN RETURN NEW; END IF;
  added := ARRAY(
    SELECT t FROM unnest(NEW.tags) t
     WHERE t IS NOT NULL
       AND NOT (t = ANY (COALESCE(OLD.tags, ARRAY[]::text[])))
  );
  IF array_length(added, 1) IS NULL THEN RETURN NEW; END IF;

  FOR r IN
    SELECT id, COALESCE(trigger_config, '{}'::jsonb) AS cfg
      FROM crm_automations
     WHERE is_active = true
       AND trigger_type = 'tag_added'
  LOOP
    v_tag := NULLIF(r.cfg->>'tag', '');
    IF v_tag IS NULL OR v_tag = ANY (added) THEN
      PERFORM enroll_in_automation(r.id, NEW.id,
        jsonb_build_object('event','tag_added','tags',to_jsonb(added)));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_contacts_auto_new_lead ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_auto_new_lead
  AFTER INSERT ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_contacts_auto_new_lead();

DROP TRIGGER IF EXISTS trg_crm_contacts_auto_status_change ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_auto_status_change
  AFTER UPDATE OF status ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_contacts_auto_status_change();

DROP TRIGGER IF EXISTS trg_crm_contacts_auto_tag_added ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_auto_tag_added
  AFTER UPDATE OF tags ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_contacts_auto_tag_added();
