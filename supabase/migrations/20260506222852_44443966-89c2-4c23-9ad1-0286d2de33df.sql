
-- 1. Create CRON_SECRET in vault if missing
DO $$
DECLARE
  v_existing uuid;
  v_secret text;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'CRON_SECRET';
  IF v_existing IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'CRON_SECRET', 'Shared secret for pg_cron → edge function authentication');
  END IF;
END $$;

-- 2. Drop duplicate / broken cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-emails-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-emails');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-sms');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('crm-process-scheduled-campaigns');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Reschedule with x-cron-secret header (resolved at call-time from vault)
SELECT cron.schedule(
  'process-scheduled-emails',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/process-scheduled-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('source','pg_cron','tick_at',now())
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'process-scheduled-sms',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/process-scheduled-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('source','pg_cron','tick_at',now())
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'crm-process-scheduled-campaigns',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/crm-process-scheduled-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

-- 4. Reassign 2 stray unassigned contacts to the workspace owner so they show in the pipeline
UPDATE public.crm_contacts
SET assigned_to = (SELECT display_name FROM public.crm_team WHERE role = 'owner' LIMIT 1)
WHERE (assigned_to IS NULL OR assigned_to = '')
  AND EXISTS (SELECT 1 FROM public.crm_team WHERE role = 'owner');
