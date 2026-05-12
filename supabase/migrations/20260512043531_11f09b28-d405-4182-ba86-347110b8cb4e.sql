
-- 1. Internal config table (admin-only) — holds service role + functions URL
CREATE TABLE IF NOT EXISTS public.crm_internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_internal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read internal config" ON public.crm_internal_config;
CREATE POLICY "Admins can read internal config"
  ON public.crm_internal_config
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage internal config" ON public.crm_internal_config;
CREATE POLICY "Admins can manage internal config"
  ON public.crm_internal_config
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Dispatcher: posts to send-push-notification via pg_net for med/high severity
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url   text;
  v_key   text;
  v_body  jsonb;
BEGIN
  -- Only fan out push for actionable notifications.
  IF NEW.severity IS NULL OR NEW.severity NOT IN ('med', 'high') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_url FROM public.crm_internal_config WHERE key = 'functions_base_url';
  SELECT value INTO v_key FROM public.crm_internal_config WHERE key = 'service_role_key';

  -- Bootstrap not yet run; skip silently rather than break the insert.
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'user_id', NEW.user_id,
    'title',   COALESCE(NEW.title, 'Dealzflow'),
    'message', COALESCE(NEW.body, ''),
    'url',     COALESCE(NEW.link_to, '/crm/inbox')
  );

  PERFORM net.http_post(
    url     := v_url || '/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := v_body,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the underlying insert because of a push failure.
  RETURN NEW;
END;
$$;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_dispatch_push_for_notification ON public.crm_notifications;
CREATE TRIGGER trg_dispatch_push_for_notification
AFTER INSERT ON public.crm_notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_for_notification();
