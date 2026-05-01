---
name: Storage Bucket Lockdown
description: email-attachments and crm-assets are CRM-member-only; outbound emails MUST embed 30-day signed URLs
type: feature
---
**Buckets & policies on storage.objects:**

- `email-attachments` — SELECT gated by `is_crm_member(auth.uid())`. INSERT/UPDATE/DELETE still scoped to the uploader's `auth.uid()` folder.
- `crm-assets` — SELECT gated by `is_crm_member(auth.uid())`. (Currently empty — referenced as a name only.)
- `crm-sms-media`, `crm-team-headshots`, `avatars`, `brand-logos`, `crm-media` — unchanged from prior policies.

**Composer rule (CRITICAL):** When attaching files to an outbound email (`ComposerSurface.tsx`, `ComposeEmailDialog.tsx`, and any future composer), use `createSignedUrl(path, 60*60*24*30)` — NOT `getPublicUrl()`. External recipients are not signed in and cannot read the bucket directly.

If you ever need to embed an `email-attachments` URL from a server-side edge function (e.g., scheduled / mass send), call `createSignedUrl` from the service-role client with the same 30-day TTL. Service role bypasses RLS so the call always works.

Never re-add a `public` SELECT policy on these buckets. Do not flip `storage.buckets.public` to `true` for either.
