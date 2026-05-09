
-- ============ Inbound event log + idempotency ============
CREATE TABLE IF NOT EXISTS public.crm_inbound_events (
  idempotency_key text PRIMARY KEY,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  signature       text,
  signature_valid boolean,
  occurred_at     timestamptz,
  contact_id      uuid,
  status          text NOT NULL DEFAULT 'received',
  error           text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_crm_inbound_events_received_at
  ON public.crm_inbound_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_inbound_events_type
  ON public.crm_inbound_events (event_type, received_at DESC);

ALTER TABLE public.crm_inbound_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read inbound events"
  ON public.crm_inbound_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============ Outbound webhook queue ============
CREATE TABLE IF NOT EXISTS public.crm_outbound_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url      text NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  idempotency_key text,
  attempts        int  NOT NULL DEFAULT 0,
  max_attempts    int  NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending',
  last_status_code int,
  last_error      text,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_outbound_webhooks_due
  ON public.crm_outbound_webhooks (status, next_attempt_at)
  WHERE status IN ('pending','retry');

ALTER TABLE public.crm_outbound_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read outbound webhooks"
  ON public.crm_outbound_webhooks FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============ Contract.signed columns ============
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS lead_value numeric,
  ADD COLUMN IF NOT EXISTS lead_currency text,
  ADD COLUMN IF NOT EXISTS won_at timestamptz;

-- ============ Task claim columns ============
ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_token text,
  ADD COLUMN IF NOT EXISTS lead_external_id text,
  ADD COLUMN IF NOT EXISTS presale_task_id text;

-- ============ Trigger: enqueue task.claimed outbound webhook ============
CREATE OR REPLACE FUNCTION public.enqueue_task_claimed_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
BEGIN
  IF (NEW.status = 'claimed' AND (OLD.status IS DISTINCT FROM 'claimed'))
     AND NEW.presale_task_id IS NOT NULL THEN
    v_target := 'https://presaleproperties.com/api/crm-inbound';
    INSERT INTO public.crm_outbound_webhooks
      (target_url, event_type, payload, idempotency_key)
    VALUES (
      v_target,
      'task.claimed',
      jsonb_build_object(
        'type', 'task.claimed',
        'occurred_at', to_char(coalesce(NEW.claimed_at, now()) AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'idempotency_key', NEW.presale_task_id || ':' ||
                           extract(epoch from coalesce(NEW.claimed_at, now()))::text,
        'payload', jsonb_build_object(
          'task_id', NEW.presale_task_id,
          'lead_id', NEW.lead_external_id,
          'claimed_by_agent_id', NEW.claimed_by,
          'claimed_at', NEW.claimed_at,
          'ack_token', NEW.ack_token
        )
      ),
      NEW.presale_task_id || ':claimed'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_task_claimed ON public.crm_tasks;
CREATE TRIGGER trg_enqueue_task_claimed
  AFTER UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_claimed_webhook();

-- ============ RPC: claim a task ============
CREATE OR REPLACE FUNCTION public.crm_claim_task(_task_id uuid, _ack_token text DEFAULT NULL)
RETURNS public.crm_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.crm_tasks;
BEGIN
  UPDATE public.crm_tasks
     SET status = 'claimed',
         claimed_by = auth.uid(),
         claimed_at = now(),
         ack_token = COALESCE(_ack_token, ack_token)
   WHERE id = _task_id
     AND (status IS NULL OR status NOT IN ('claimed','completed'))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_claim_task(uuid, text) TO authenticated;
