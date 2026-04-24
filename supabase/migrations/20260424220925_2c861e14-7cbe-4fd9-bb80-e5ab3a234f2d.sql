-- Public bucket for email composer attachments (so recipients can load images)
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', true)
on conflict (id) do nothing;

-- Public read so email recipients can load images
create policy "Email attachments are publicly readable"
on storage.objects
for select
using (bucket_id = 'email-attachments');

-- Authenticated CRM users can upload to their own folder
create policy "Authenticated users can upload email attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'email-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own email attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'email-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete their own email attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'email-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);
