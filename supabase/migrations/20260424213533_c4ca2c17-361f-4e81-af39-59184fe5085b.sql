CREATE TABLE public.crm_email_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  html TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_email_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signatures"
ON public.crm_email_signatures FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signatures"
ON public.crm_email_signatures FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signatures"
ON public.crm_email_signatures FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own signatures"
ON public.crm_email_signatures FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_crm_email_signatures_user ON public.crm_email_signatures(user_id);

CREATE TRIGGER update_crm_email_signatures_updated_at
BEFORE UPDATE ON public.crm_email_signatures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one default signature per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.crm_email_signatures
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_default_signature_trigger
BEFORE INSERT OR UPDATE ON public.crm_email_signatures
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_signature();

-- Seed: migrate existing single signature into the new table for each user
INSERT INTO public.crm_email_signatures (user_id, name, html, is_default, sort_order)
SELECT user_id,
       'Default signature',
       COALESCE(signature_html, ''),
       true,
       0
FROM public.crm_email_settings
WHERE signature_html IS NOT NULL AND signature_html <> ''
ON CONFLICT DO NOTHING;