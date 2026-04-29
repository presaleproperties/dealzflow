ALTER TABLE public.crm_email_settings
  ADD COLUMN IF NOT EXISTS brand_logo_enabled boolean NOT NULL DEFAULT false;