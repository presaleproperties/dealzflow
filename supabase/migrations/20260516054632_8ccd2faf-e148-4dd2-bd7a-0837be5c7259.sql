-- Tier 2: Campaigns Page — keep bulk sends out of /crm/inbox.

ALTER TABLE public.crm_email_threads
  ADD COLUMN IF NOT EXISTS campaign_id uuid
  REFERENCES public.crm_email_campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.crm_email_log
  ADD COLUMN IF NOT EXISTS campaign_id uuid
  REFERENCES public.crm_email_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_email_threads_campaign
  ON public.crm_email_threads (campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_email_threads_inbox
  ON public.crm_email_threads (is_archived, last_message_at DESC)
  WHERE campaign_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_email_log_campaign
  ON public.crm_email_log (campaign_id, sent_at DESC)
  WHERE campaign_id IS NOT NULL;

-- Stamp thread as campaign-origin when first outbound email logged with a campaign.
-- We tag the thread campaign_id only when it currently has none — subsequent
-- outbound campaign sends on the same thread won't change the original tag,
-- and inbound replies always clear it (see promote trigger below).
CREATE OR REPLACE FUNCTION public.crm_tag_thread_on_campaign_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'outbound'
     AND NEW.campaign_id IS NOT NULL
     AND NEW.thread_id IS NOT NULL THEN
    UPDATE public.crm_email_threads
       SET campaign_id = NEW.campaign_id
     WHERE id = NEW.thread_id
       AND campaign_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_tag_thread_on_campaign_email ON public.crm_email_log;
CREATE TRIGGER trg_crm_tag_thread_on_campaign_email
AFTER INSERT ON public.crm_email_log
FOR EACH ROW
EXECUTE FUNCTION public.crm_tag_thread_on_campaign_email();

-- Promote a campaign-tagged email thread back into the inbox on first inbound reply.
CREATE OR REPLACE FUNCTION public.crm_promote_email_thread_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.thread_id IS NOT NULL THEN
    UPDATE public.crm_email_threads
       SET campaign_id = NULL
     WHERE id = NEW.thread_id
       AND campaign_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_promote_email_thread_on_reply ON public.crm_gmail_messages;
CREATE TRIGGER trg_crm_promote_email_thread_on_reply
AFTER INSERT ON public.crm_gmail_messages
FOR EACH ROW
EXECUTE FUNCTION public.crm_promote_email_thread_on_reply();