
-- Public bucket for brand logos used in email banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read so email recipients' inboxes can load the image
CREATE POLICY "Brand logos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-logos');

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload their own brand logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own brand logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own brand logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
