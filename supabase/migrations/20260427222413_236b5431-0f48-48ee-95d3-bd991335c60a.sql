ALTER TABLE public.crm_email_settings
  ADD COLUMN IF NOT EXISTS brand_logo_url text,
  ADD COLUMN IF NOT EXISTS brand_logo_alt text;