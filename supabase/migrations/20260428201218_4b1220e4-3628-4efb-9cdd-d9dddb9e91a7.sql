CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'scheduler-reminders-every-5min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'scheduler-reminders-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/scheduler-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YmlscXZ1ZGtrZGhzbHhlYmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTM1MzYsImV4cCI6MjA4MzQ2OTUzNn0.PgyiztrokbiRoS1y9qzYAgZ7Zlq2g_z6InPveD7xkoI"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);