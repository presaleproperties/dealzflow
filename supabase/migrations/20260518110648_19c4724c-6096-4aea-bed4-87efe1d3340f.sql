
-- Relax user_id and add public-visitor columns
ALTER TABLE public.zara_conversations
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS presale_user_id text,
  ADD COLUMN IF NOT EXISTS presale_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'agent';

-- Exactly one of (user_id, presale_user_id) must be present
ALTER TABLE public.zara_conversations
  DROP CONSTRAINT IF EXISTS zara_conversations_owner_check;
ALTER TABLE public.zara_conversations
  ADD CONSTRAINT zara_conversations_owner_check
  CHECK (user_id IS NOT NULL OR presale_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_zara_conv_presale_user
  ON public.zara_conversations(presale_user_id, last_message_at DESC NULLS LAST)
  WHERE presale_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zara_conv_presale_contact
  ON public.zara_conversations(presale_contact_id)
  WHERE presale_contact_id IS NOT NULL;

-- Rate-limit table (rolling 1-hour windows per visitor)
CREATE TABLE IF NOT EXISTS public.zara_public_rate_limits (
  presale_user_id text PRIMARY KEY,
  window_start    timestamptz NOT NULL DEFAULT now(),
  message_count   integer NOT NULL DEFAULT 0,
  send_count      integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zara_public_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies = no API access. Only service role bypasses RLS.

CREATE OR REPLACE FUNCTION public.zara_public_rate_check(
  _presale_user_id text,
  _is_send boolean DEFAULT false,
  _msg_limit int DEFAULT 30,
  _send_limit int DEFAULT 10
)
RETURNS TABLE(allowed boolean, retry_after_seconds int, message_count int, send_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.zara_public_rate_limits%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO r FROM public.zara_public_rate_limits WHERE presale_user_id = _presale_user_id FOR UPDATE;
  IF NOT FOUND OR r.window_start < v_now - interval '1 hour' THEN
    INSERT INTO public.zara_public_rate_limits(presale_user_id, window_start, message_count, send_count, updated_at)
    VALUES (_presale_user_id, v_now, 1, CASE WHEN _is_send THEN 1 ELSE 0 END, v_now)
    ON CONFLICT (presale_user_id) DO UPDATE
      SET window_start = v_now,
          message_count = 1,
          send_count = CASE WHEN _is_send THEN 1 ELSE 0 END,
          updated_at = v_now;
    RETURN QUERY SELECT true, 0, 1, CASE WHEN _is_send THEN 1 ELSE 0 END;
    RETURN;
  END IF;

  IF r.message_count >= _msg_limit OR (_is_send AND r.send_count >= _send_limit) THEN
    RETURN QUERY SELECT false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.window_start + interval '1 hour' - v_now)))::int),
      r.message_count, r.send_count;
    RETURN;
  END IF;

  UPDATE public.zara_public_rate_limits
    SET message_count = message_count + 1,
        send_count = send_count + CASE WHEN _is_send THEN 1 ELSE 0 END,
        updated_at = v_now
    WHERE presale_user_id = _presale_user_id
    RETURNING message_count, send_count INTO r.message_count, r.send_count;

  RETURN QUERY SELECT true, 0, r.message_count, r.send_count;
END;
$$;
