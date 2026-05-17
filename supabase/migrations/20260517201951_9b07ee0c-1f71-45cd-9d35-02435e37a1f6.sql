ALTER TABLE public.zara_settings
  ADD COLUMN IF NOT EXISTS email_use_template_scaffold boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_append_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_fallback_template_id uuid REFERENCES public.crm_email_templates(id) ON DELETE SET NULL;