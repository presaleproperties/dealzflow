-- Add signature builder columns to crm_email_settings
ALTER TABLE public.crm_email_settings
  ADD COLUMN IF NOT EXISTS signature_mode text NOT NULL DEFAULT 'builder',
  ADD COLUMN IF NOT EXISTS signature_builder_data jsonb;

-- Create crm-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-assets', 'crm-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Anyone can view crm assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'crm-assets');

CREATE POLICY "Authenticated users can upload crm assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'crm-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own crm assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'crm-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own crm assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'crm-assets' AND auth.uid()::text = (storage.foldername(name))[1]);