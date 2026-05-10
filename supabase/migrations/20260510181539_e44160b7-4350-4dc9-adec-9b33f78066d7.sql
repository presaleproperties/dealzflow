-- Add campaign visibility flags to conversations
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS is_campaign boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by_campaign_id uuid;

CREATE INDEX IF NOT EXISTS idx_crm_conversations_campaign
  ON public.crm_conversations (is_campaign, last_message_at DESC NULLS LAST);

-- Replace SMS sync trigger so campaign-only outbound sends create
-- a HIDDEN campaign conversation (won't show in normal inbox until reply).
CREATE OR REPLACE FUNCTION public.crm_sync_sms_log_to_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id uuid;
  _channel text;
  _existing_id uuid;
  _is_new boolean := false;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  _channel := CASE WHEN NEW.channel = 'whatsapp' THEN 'whatsapp' ELSE 'sms' END;

  -- Look for an existing conversation for this contact+channel
  SELECT id INTO _existing_id
  FROM public.crm_conversations
  WHERE contact_id = NEW.contact_id AND channel = _channel
  ORDER BY last_message_at DESC NULLS LAST, created_at ASC
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    _conversation_id := _existing_id;
  ELSE
    -- Brand-new conversation. If this row is part of a campaign blast AND
    -- it's outbound, create the conversation hidden + flagged so it stays
    -- out of the main inbox until the recipient replies.
    INSERT INTO public.crm_conversations (
      contact_id, channel, status, last_message_at, unread_count,
      is_campaign, is_archived, started_by_campaign_id
    )
    VALUES (
      NEW.contact_id, _channel, 'open',
      COALESCE(NEW.sent_at, NEW.created_at, now()), 0,
      CASE WHEN NEW.campaign_id IS NOT NULL AND COALESCE(NEW.direction, 'outbound') = 'outbound' THEN true ELSE false END,
      CASE WHEN NEW.campaign_id IS NOT NULL AND COALESCE(NEW.direction, 'outbound') = 'outbound' THEN true ELSE false END,
      NEW.campaign_id
    )
    RETURNING id INTO _conversation_id;
    _is_new := true;
  END IF;

  INSERT INTO public.crm_messages (
    conversation_id, contact_id, direction, content, message_type, channel,
    read, delivered, sent_by, created_at, source_table, source_id
  ) VALUES (
    _conversation_id, NEW.contact_id, COALESCE(NEW.direction, 'outbound'),
    NEW.body, COALESCE(NEW.message_type, 'text'), _channel,
    CASE WHEN NEW.direction = 'inbound' THEN false ELSE true END,
    NEW.status IN ('sent', 'delivered', 'queued', 'accepted'),
    CASE WHEN NEW.direction = 'outbound' THEN 'You' ELSE NULL END,
    COALESCE(NEW.sent_at, NEW.created_at, now()),
    'crm_sms_log', NEW.id
  )
  ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    content = EXCLUDED.content,
    delivered = EXCLUDED.delivered,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

-- New trigger: when an INBOUND message lands in a campaign conversation,
-- promote it to a normal inbox thread.
CREATE OR REPLACE FUNCTION public.crm_promote_campaign_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.conversation_id IS NOT NULL THEN
    UPDATE public.crm_conversations
       SET is_campaign = false,
           is_archived = false,
           first_reply_at = COALESCE(first_reply_at, NEW.created_at, now())
     WHERE id = NEW.conversation_id
       AND is_campaign = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_promote_campaign_on_reply ON public.crm_messages;
CREATE TRIGGER trg_crm_promote_campaign_on_reply
AFTER INSERT ON public.crm_messages
FOR EACH ROW EXECUTE FUNCTION public.crm_promote_campaign_on_reply();