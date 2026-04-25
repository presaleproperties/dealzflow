INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-sms-media', 'crm-sms-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "SMS media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'crm-sms-media');

CREATE POLICY "CRM members can upload SMS media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'crm-sms-media' AND public.is_crm_member(auth.uid()));

CREATE POLICY "CRM members can update SMS media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'crm-sms-media' AND public.is_crm_member(auth.uid()));

CREATE POLICY "CRM members can delete SMS media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'crm-sms-media' AND public.is_crm_member(auth.uid()));