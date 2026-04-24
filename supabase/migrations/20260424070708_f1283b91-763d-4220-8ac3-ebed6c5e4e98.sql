CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule prior version if exists
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'crm-overdue-followups-daily';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'crm-overdue-followups-daily',
  '0 8 * * *',
  $$ SELECT public.notify_overdue_followups(); $$
);