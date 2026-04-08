
-- Create email settings table
CREATE TABLE public.crm_email_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  sender_name text,
  reply_to text,
  signature_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email settings"
  ON public.crm_email_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email settings"
  ON public.crm_email_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email settings"
  ON public.crm_email_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_crm_email_settings_updated_at
  BEFORE UPDATE ON public.crm_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add cc/bcc to email log
ALTER TABLE public.crm_email_log ADD COLUMN cc text;
ALTER TABLE public.crm_email_log ADD COLUMN bcc text;
