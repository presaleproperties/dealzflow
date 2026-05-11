-- Make crm-sms-media bucket publicly readable so Twilio can fetch outbound MMS
-- and inbound media URLs render in browsers.
update storage.buckets set public = true where id = 'crm-sms-media';

-- Replace CRM-only read policy with a public read policy
drop policy if exists "CRM members can read SMS media" on storage.objects;
create policy "Public can read SMS media"
on storage.objects for select
using (bucket_id = 'crm-sms-media');