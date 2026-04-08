
-- Gmail OAuth tokens table
CREATE TABLE public.gmail_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  gmail_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own gmail tokens"
  ON public.gmail_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gmail tokens"
  ON public.gmail_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gmail tokens"
  ON public.gmail_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gmail tokens"
  ON public.gmail_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_gmail_tokens_updated_at
  BEFORE UPDATE ON public.gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRM email log table
CREATE TABLE public.crm_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction TEXT NOT NULL DEFAULT 'outbound',
  gmail_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view email logs"
  ON public.crm_email_log FOR SELECT
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM agents can insert email logs"
  ON public.crm_email_log FOR INSERT
  WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

CREATE INDEX idx_crm_email_log_contact ON public.crm_email_log(contact_id);
CREATE INDEX idx_crm_email_log_user ON public.crm_email_log(user_id);
