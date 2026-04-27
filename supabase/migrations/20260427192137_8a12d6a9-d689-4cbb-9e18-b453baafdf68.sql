-- Ensure conversation summaries can notify the app in real time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_conversations;
  END IF;
END $$;

-- Track which operational log row created a unified chat message so syncs are idempotent.
ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_messages_source
ON public.crm_messages (source_table, source_id)
WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversations_contact_channel
ON public.crm_conversations (contact_id, channel, last_message_at DESC NULLS LAST);

-- Helper: get the canonical conversation row for a lead + channel, creating one if needed.
CREATE OR REPLACE FUNCTION public.crm_get_or_create_conversation(
  _contact_id uuid,
  _channel text,
  _message_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id uuid;
BEGIN
  IF _contact_id IS NULL OR _channel IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id
    INTO _conversation_id
  FROM public.crm_conversations
  WHERE contact_id = _contact_id
    AND channel = _channel
  ORDER BY last_message_at DESC NULLS LAST, created_at ASC
  LIMIT 1;

  IF _conversation_id IS NULL THEN
    INSERT INTO public.crm_conversations (contact_id, channel, status, last_message_at, unread_count)
    VALUES (_contact_id, _channel, 'open', _message_at, 0)
    RETURNING id INTO _conversation_id;
  END IF;

  RETURN _conversation_id;
END;
$$;

-- Keep conversation summary fields current whenever a unified message is created.
CREATE OR REPLACE FUNCTION public.crm_update_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_conversations
     SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
         unread_count = GREATEST(COALESCE(unread_count, 0), 0) + CASE
           WHEN NEW.direction = 'inbound' AND COALESCE(NEW.read, false) = false THEN 1
           ELSE 0
         END
   WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_update_conversation_on_message ON public.crm_messages;
CREATE TRIGGER trg_crm_update_conversation_on_message
AFTER INSERT ON public.crm_messages
FOR EACH ROW EXECUTE FUNCTION public.crm_update_conversation_on_message();

-- Mirror SMS / WhatsApp operational logs into the unified chat message table.
CREATE OR REPLACE FUNCTION public.crm_sync_sms_log_to_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id uuid;
  _channel text;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  _channel := CASE WHEN NEW.channel = 'whatsapp' THEN 'whatsapp' ELSE 'sms' END;
  _conversation_id := public.crm_get_or_create_conversation(NEW.contact_id, _channel, COALESCE(NEW.sent_at, NEW.created_at, now()));

  INSERT INTO public.crm_messages (
    conversation_id,
    contact_id,
    direction,
    content,
    message_type,
    channel,
    read,
    delivered,
    sent_by,
    created_at,
    source_table,
    source_id
  ) VALUES (
    _conversation_id,
    NEW.contact_id,
    COALESCE(NEW.direction, 'outbound'),
    NEW.body,
    COALESCE(NEW.message_type, 'text'),
    _channel,
    CASE WHEN NEW.direction = 'inbound' THEN false ELSE true END,
    NEW.status IN ('sent', 'delivered', 'queued', 'accepted'),
    CASE WHEN NEW.direction = 'outbound' THEN 'You' ELSE NULL END,
    COALESCE(NEW.sent_at, NEW.created_at, now()),
    'crm_sms_log',
    NEW.id
  )
  ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    content = EXCLUDED.content,
    delivered = EXCLUDED.delivered,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_sms_log_to_messages ON public.crm_sms_log;
CREATE TRIGGER trg_crm_sync_sms_log_to_messages
AFTER INSERT OR UPDATE OF status, body, sent_at ON public.crm_sms_log
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_sms_log_to_messages();

-- Mirror sent/received email log rows into the unified chat message table.
CREATE OR REPLACE FUNCTION public.crm_sync_email_log_to_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id uuid;
  _body text;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  _conversation_id := public.crm_get_or_create_conversation(NEW.contact_id, 'email', COALESCE(NEW.sent_at, NEW.created_at, now()));
  _body := concat_ws(E'\n\n', NULLIF(NEW.subject, ''), NULLIF(NEW.body, ''));

  INSERT INTO public.crm_messages (
    conversation_id,
    contact_id,
    direction,
    content,
    message_type,
    channel,
    read,
    delivered,
    sent_by,
    created_at,
    source_table,
    source_id
  ) VALUES (
    _conversation_id,
    NEW.contact_id,
    COALESCE(NEW.direction, 'outbound'),
    NULLIF(_body, ''),
    'email',
    'email',
    CASE WHEN NEW.direction = 'inbound' THEN false ELSE true END,
    true,
    CASE WHEN NEW.direction = 'outbound' THEN 'You' ELSE NULL END,
    COALESCE(NEW.sent_at, NEW.created_at, now()),
    'crm_email_log',
    NEW.id
  )
  ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    content = EXCLUDED.content,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sync_email_log_to_messages ON public.crm_email_log;
CREATE TRIGGER trg_crm_sync_email_log_to_messages
AFTER INSERT OR UPDATE OF subject, body, sent_at ON public.crm_email_log
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_email_log_to_messages();

-- Backfill existing SMS / WhatsApp history into unified chat messages.
INSERT INTO public.crm_messages (
  conversation_id,
  contact_id,
  direction,
  content,
  message_type,
  channel,
  read,
  delivered,
  sent_by,
  created_at,
  source_table,
  source_id
)
SELECT
  public.crm_get_or_create_conversation(l.contact_id, CASE WHEN l.channel = 'whatsapp' THEN 'whatsapp' ELSE 'sms' END, COALESCE(l.sent_at, l.created_at, now())),
  l.contact_id,
  COALESCE(l.direction, 'outbound'),
  l.body,
  COALESCE(l.message_type, 'text'),
  CASE WHEN l.channel = 'whatsapp' THEN 'whatsapp' ELSE 'sms' END,
  CASE WHEN l.direction = 'inbound' THEN false ELSE true END,
  l.status IN ('sent', 'delivered', 'queued', 'accepted'),
  CASE WHEN l.direction = 'outbound' THEN 'You' ELSE NULL END,
  COALESCE(l.sent_at, l.created_at, now()),
  'crm_sms_log',
  l.id
FROM public.crm_sms_log l
WHERE l.contact_id IS NOT NULL
ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
DO NOTHING;

-- Backfill existing email history into unified chat messages.
INSERT INTO public.crm_messages (
  conversation_id,
  contact_id,
  direction,
  content,
  message_type,
  channel,
  read,
  delivered,
  sent_by,
  created_at,
  source_table,
  source_id
)
SELECT
  public.crm_get_or_create_conversation(e.contact_id, 'email', COALESCE(e.sent_at, e.created_at, now())),
  e.contact_id,
  COALESCE(e.direction, 'outbound'),
  NULLIF(concat_ws(E'\n\n', NULLIF(e.subject, ''), NULLIF(e.body, '')), ''),
  'email',
  'email',
  CASE WHEN e.direction = 'inbound' THEN false ELSE true END,
  true,
  CASE WHEN e.direction = 'outbound' THEN 'You' ELSE NULL END,
  COALESCE(e.sent_at, e.created_at, now()),
  'crm_email_log',
  e.id
FROM public.crm_email_log e
WHERE e.contact_id IS NOT NULL
ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
DO NOTHING;

-- Recalculate conversation summary timestamps after backfill.
UPDATE public.crm_conversations c
SET last_message_at = m.max_created_at,
    unread_count = m.unread_count
FROM (
  SELECT conversation_id,
         MAX(created_at) AS max_created_at,
         COUNT(*) FILTER (WHERE direction = 'inbound' AND COALESCE(read, false) = false)::int AS unread_count
  FROM public.crm_messages
  GROUP BY conversation_id
) m
WHERE c.id = m.conversation_id;