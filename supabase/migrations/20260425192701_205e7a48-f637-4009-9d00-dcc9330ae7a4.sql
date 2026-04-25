-- Make buckets private (disables the public LIST endpoint while direct reads still honor RLS)
UPDATE storage.buckets SET public = false WHERE id IN ('crm-assets', 'email-attachments', 'crm-sms-media');

-- crm-assets: replace broad public SELECT with direct-file read only
DROP POLICY IF EXISTS "Anyone can view crm assets" ON storage.objects;
CREATE POLICY "Public can read crm asset files by direct URL"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'crm-assets' AND name IS NOT NULL AND name <> '');

-- email-attachments: replace broad public SELECT with direct-file read only
DROP POLICY IF EXISTS "Email attachments are publicly readable" ON storage.objects;
CREATE POLICY "Public can read email attachment files by direct URL"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-attachments' AND name IS NOT NULL AND name <> '');

-- crm-sms-media: tighten to CRM members only
DROP POLICY IF EXISTS "SMS media authenticated read" ON storage.objects;
CREATE POLICY "CRM members can read SMS media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'crm-sms-media' AND public.is_crm_member(auth.uid()));