
-- 1. Re-point messages from duplicate conversations onto the oldest one
WITH ranked AS (
  SELECT id, contact_id, channel,
         ROW_NUMBER() OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC, id ASC) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.crm_conversations
),
mapping AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
UPDATE public.crm_messages m
SET conversation_id = mp.canonical_id
FROM mapping mp
WHERE m.conversation_id = mp.dup_id;

-- 2. Roll up unread_count, is_starred, and last_message_at onto canonical rows
WITH ranked AS (
  SELECT id, contact_id, channel, unread_count, is_starred, last_message_at,
         FIRST_VALUE(id) OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.crm_conversations
),
agg AS (
  SELECT canonical_id,
         SUM(unread_count)    AS total_unread,
         BOOL_OR(is_starred)  AS any_starred,
         MAX(last_message_at) AS latest_msg_at
  FROM ranked
  GROUP BY canonical_id
)
UPDATE public.crm_conversations c
SET unread_count    = COALESCE(agg.total_unread, c.unread_count),
    is_starred      = COALESCE(agg.any_starred,  c.is_starred),
    last_message_at = COALESCE(agg.latest_msg_at, c.last_message_at)
FROM agg
WHERE c.id = agg.canonical_id;

-- 3. Delete the now-empty duplicate conversation rows
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY contact_id, channel ORDER BY created_at ASC, id ASC) AS rn
  FROM public.crm_conversations
)
DELETE FROM public.crm_conversations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Enforce one conversation per (contact, channel) going forward
CREATE UNIQUE INDEX IF NOT EXISTS crm_conversations_contact_channel_uniq
  ON public.crm_conversations (contact_id, channel);
