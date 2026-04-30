-- Recreate the process-scheduled-emails cron job using the same Authorization
-- bearer pattern that crm-process-scheduled-campaigns / gmail-sync-cron /
-- scheduler-reminders already use. This removes the dependency on a vault
-- row named CRON_SECRET that no longer exists, which was causing the cron
-- to send an empty x-cron-secret header and the function to reject with 401.

select cron.unschedule('process-scheduled-emails-every-minute');

select
  cron.schedule(
    'process-scheduled-emails-every-minute',
    '* * * * *',
    $$
    select net.http_post(
      url := 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1/process-scheduled-emails',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YmlscXZ1ZGtrZGhzbHhlYmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTM1MzYsImV4cCI6MjA4MzQ2OTUzNn0.PgyiztrokbiRoS1y9qzYAgZ7Zlq2g_z6InPveD7xkoI"}'::jsonb,
      body := '{}'::jsonb
    );
    $$
  );