DROP POLICY IF EXISTS "SMS media public read" ON storage.objects;

CREATE POLICY "SMS media authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'crm-sms-media');