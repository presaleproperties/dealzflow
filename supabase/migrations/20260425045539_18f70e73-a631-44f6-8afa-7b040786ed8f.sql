
-- 1. Email threads table
CREATE TABLE IF NOT EXISTS public.crm_email_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  gmail_thread_id TEXT,
  subject TEXT NOT NULL DEFAULT '(no subject)',
  participants TEXT[] NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_snippet TEXT,
  last_message_from TEXT,
  message_count INT NOT NULL DEFAULT 0,
  unread_count INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_email_threads_contact ON public.crm_email_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_threads_user ON public.crm_email_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_threads_last_message ON public.crm_email_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_email_threads_unread ON public.crm_email_threads(user_id, unread_count) WHERE unread_count > 0;

ALTER TABLE public.crm_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view email threads"
  ON public.crm_email_threads FOR SELECT
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "Users can update their own email threads"
  ON public.crm_email_threads FOR UPDATE
  USING (auth.uid() = user_id OR public.is_crm_admin(auth.uid()));

CREATE POLICY "Users can insert their own email threads"
  ON public.crm_email_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email threads"
  ON public.crm_email_threads FOR DELETE
  USING (auth.uid() = user_id OR public.is_crm_admin(auth.uid()));

-- 2. Gmail messages table (synced inbound + outbound from Gmail API)
CREATE TABLE IF NOT EXISTS public.crm_gmail_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  thread_id UUID REFERENCES public.crm_email_threads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  message_id_header TEXT,
  in_reply_to TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] NOT NULL DEFAULT '{}',
  bcc_emails TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  labels TEXT[] NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  attachment_meta JSONB DEFAULT '[]'::jsonb,
  internal_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_user ON public.crm_gmail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_thread ON public.crm_gmail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_contact ON public.crm_gmail_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_internal_date ON public.crm_gmail_messages(internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_unread ON public.crm_gmail_messages(user_id, is_read) WHERE is_read = false AND direction = 'inbound';
CREATE INDEX IF NOT EXISTS idx_crm_gmail_messages_from_email ON public.crm_gmail_messages(from_email);

ALTER TABLE public.crm_gmail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view gmail messages"
  ON public.crm_gmail_messages FOR SELECT
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "Users can insert their own gmail messages"
  ON public.crm_gmail_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gmail messages"
  ON public.crm_gmail_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gmail messages"
  ON public.crm_gmail_messages FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Sync state table
CREATE TABLE IF NOT EXISTS public.crm_gmail_sync_state (
  user_id UUID NOT NULL PRIMARY KEY,
  last_history_id TEXT,
  last_sync_at TIMESTAMPTZ,
  watch_expires_at TIMESTAMPTZ,
  watch_history_id TEXT,
  initial_sync_completed BOOLEAN NOT NULL DEFAULT false,
  initial_sync_started_at TIMESTAMPTZ,
  total_messages_synced INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync state"
  ON public.crm_gmail_sync_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sync state"
  ON public.crm_gmail_sync_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Add reply-tracking columns to crm_email_log
ALTER TABLE public.crm_email_log
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.crm_email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS message_id_header TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_email_log_thread ON public.crm_email_log(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_log_message_id_header ON public.crm_email_log(message_id_header);

-- 5. Trigger: update thread when a new gmail message arrives
CREATE OR REPLACE FUNCTION public.update_thread_on_gmail_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.crm_email_threads
       SET last_message_at = NEW.internal_date,
           last_message_snippet = COALESCE(NEW.snippet, left(NEW.body_text, 200)),
           last_message_from = COALESCE(NEW.from_name, NEW.from_email),
           message_count = message_count + 1,
           unread_count = unread_count + CASE
             WHEN NEW.direction = 'inbound' AND NEW.is_read = false THEN 1
             ELSE 0
           END,
           updated_at = now()
     WHERE id = NEW.thread_id;
  END IF;

  -- Update lead's last_touch + lead score on inbound replies
  IF NEW.direction = 'inbound' AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.crm_contacts
       SET last_touch_at = NEW.internal_date,
           last_touch_type = 'email_reply'
     WHERE id = NEW.contact_id;

    -- Mirror inbound into crm_email_log so it shows up in existing email log views & lead score recalcs
    INSERT INTO public.crm_email_log
      (contact_id, user_id, subject, body, sent_at, direction, gmail_message_id,
       gmail_thread_id, message_id_header, in_reply_to, thread_id)
    VALUES
      (NEW.contact_id, NEW.user_id, COALESCE(NEW.subject, '(no subject)'),
       COALESCE(NEW.body_text, NEW.snippet, ''), NEW.internal_date, 'inbound',
       NEW.gmail_message_id, NEW.gmail_thread_id, NEW.message_id_header,
       NEW.in_reply_to, NEW.thread_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_on_gmail_message ON public.crm_gmail_messages;
CREATE TRIGGER trg_update_thread_on_gmail_message
AFTER INSERT ON public.crm_gmail_messages
FOR EACH ROW EXECUTE FUNCTION public.update_thread_on_gmail_message();

-- 6. Trigger: update thread unread when message is_read changes
CREATE OR REPLACE FUNCTION public.update_thread_unread_on_read_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_read IS DISTINCT FROM NEW.is_read AND NEW.direction = 'inbound' AND NEW.thread_id IS NOT NULL THEN
    IF NEW.is_read = true THEN
      UPDATE public.crm_email_threads
         SET unread_count = GREATEST(unread_count - 1, 0),
             updated_at = now()
       WHERE id = NEW.thread_id;
    ELSE
      UPDATE public.crm_email_threads
         SET unread_count = unread_count + 1,
             updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_unread ON public.crm_gmail_messages;
CREATE TRIGGER trg_update_thread_unread
AFTER UPDATE OF is_read ON public.crm_gmail_messages
FOR EACH ROW EXECUTE FUNCTION public.update_thread_unread_on_read_change();

-- 7. Trigger: notify the assigned agent when a reply lands
CREATE OR REPLACE FUNCTION public.notify_on_inbound_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first TEXT;
  v_last TEXT;
  v_assigned TEXT;
  v_recipients UUID[];
  v_full TEXT;
  v_preview TEXT;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT first_name, last_name, assigned_to INTO v_first, v_last, v_assigned
    FROM public.crm_contacts WHERE id = NEW.contact_id;

  v_full := NULLIF(TRIM(COALESCE(v_first,'') || ' ' || COALESCE(v_last,'')), '');
  IF v_full IS NULL THEN v_full := 'A lead'; END IF;

  v_preview := left(COALESCE(NEW.snippet, NEW.body_text, '(empty)'), 140);

  v_recipients := public.crm_recipients_for_contact(v_assigned);
  PERFORM public.notify_crm(
    v_recipients,
    '✉️ ' || v_full || ' replied',
    COALESCE('"' || NEW.subject || '" — ' || v_preview, v_preview),
    'email_reply',
    '/crm/leads/' || NEW.contact_id::text || '?tab=email'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_inbound_email ON public.crm_gmail_messages;
CREATE TRIGGER trg_notify_on_inbound_email
AFTER INSERT ON public.crm_gmail_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_inbound_email();

-- 8. updated_at trigger on threads
DROP TRIGGER IF EXISTS trg_threads_updated_at ON public.crm_email_threads;
CREATE TRIGGER trg_threads_updated_at
BEFORE UPDATE ON public.crm_email_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_gmail_sync_state_updated_at ON public.crm_gmail_sync_state;
CREATE TRIGGER trg_gmail_sync_state_updated_at
BEFORE UPDATE ON public.crm_gmail_sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
