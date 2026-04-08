-- Add missing columns to crm_email_templates
ALTER TABLE public.crm_email_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS merge_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update updated_at
CREATE TRIGGER update_crm_email_templates_updated_at
  BEFORE UPDATE ON public.crm_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();