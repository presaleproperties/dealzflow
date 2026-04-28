-- ─── 1. crm_automations: add slug + updated_at ───
ALTER TABLE public.crm_automations
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS crm_automations_slug_key
  ON public.crm_automations (slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_automations_updated_at ON public.crm_automations;
CREATE TRIGGER trg_crm_automations_updated_at
  BEFORE UPDATE ON public.crm_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. crm_automation_steps: add delay_hours, exit_condition; FK cascade ───
ALTER TABLE public.crm_automation_steps
  ADD COLUMN IF NOT EXISTS delay_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exit_condition text;

-- Recreate FK with ON DELETE CASCADE
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid='public.crm_automation_steps'::regclass
     AND contype='f' AND conkey @> ARRAY[(
       SELECT attnum FROM pg_attribute WHERE attrelid='public.crm_automation_steps'::regclass AND attname='automation_id'
     )::smallint];
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.crm_automation_steps DROP CONSTRAINT '||quote_ident(c);
  END IF;
END $$;
ALTER TABLE public.crm_automation_steps
  ADD CONSTRAINT crm_automation_steps_automation_id_fkey
  FOREIGN KEY (automation_id) REFERENCES public.crm_automations(id) ON DELETE CASCADE;

-- ─── 3. crm_automation_logs: enrollment-tracking columns ───
ALTER TABLE public.crm_automation_logs
  ADD COLUMN IF NOT EXISTS project_slug text,
  ADD COLUMN IF NOT EXISTS enrolled_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_step_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_step_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS exited_at timestamptz;

-- Re-create FKs with cascade
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.crm_automation_logs'::regclass AND contype='f'
  LOOP EXECUTE 'ALTER TABLE public.crm_automation_logs DROP CONSTRAINT '||quote_ident(c);
  END LOOP;
END $$;
ALTER TABLE public.crm_automation_logs
  ADD CONSTRAINT crm_automation_logs_automation_id_fkey
    FOREIGN KEY (automation_id) REFERENCES public.crm_automations(id) ON DELETE CASCADE,
  ADD CONSTRAINT crm_automation_logs_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.crm_contacts(id) ON DELETE CASCADE;

-- Hot-path index for the executor
CREATE INDEX IF NOT EXISTS crm_automation_logs_active_due_idx
  ON public.crm_automation_logs (next_step_due_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS crm_automation_logs_contact_idx
  ON public.crm_automation_logs (contact_id);

-- ─── 4. on_create trigger: enroll new contacts in matching automations ───
CREATE OR REPLACE FUNCTION public.trg_enroll_on_contact_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record;
  cfg jsonb;
  required_status text;
  skip_sources text[];
BEGIN
  FOR a IN
    SELECT id, trigger_config
      FROM public.crm_automations
     WHERE is_active = true
       AND trigger_type = 'on_create'
  LOOP
    cfg := COALESCE(a.trigger_config, '{}'::jsonb);
    required_status := cfg->>'status';
    skip_sources := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(cfg->'skip_sources')),
      ARRAY[]::text[]
    );

    -- Status filter
    IF required_status IS NOT NULL AND required_status <> ''
       AND COALESCE(NEW.status, '') <> required_status THEN
      CONTINUE;
    END IF;

    -- Source skip-list (matches sync_source OR source)
    IF array_length(skip_sources, 1) IS NOT NULL THEN
      IF lower(COALESCE(NEW.sync_source, '')) = ANY (SELECT lower(s) FROM unnest(skip_sources) s)
         OR lower(COALESCE(NEW.source, '')) = ANY (SELECT lower(s) FROM unnest(skip_sources) s)
      THEN CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.crm_automation_logs
      (automation_id, contact_id, status, enrolled_at, current_step_order, next_step_due_at)
    VALUES
      (a.id, NEW.id, 'active', now(), 1, now());

    UPDATE public.crm_automations
       SET total_enrolled = COALESCE(total_enrolled,0) + 1
     WHERE id = a.id;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enroll_on_contact_create ON public.crm_contacts;
CREATE TRIGGER trg_enroll_on_contact_create
  AFTER INSERT ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_enroll_on_contact_create();