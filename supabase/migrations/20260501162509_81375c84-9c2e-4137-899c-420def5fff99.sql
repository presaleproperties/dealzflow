-- ============================================================
-- Migration B — Storage Bucket Lockdown (P0)
-- ============================================================
-- Problem:
--   Both buckets are flagged private (public=false) but two SELECT policies
--   on storage.objects are scoped to role `public` (= anon + authenticated)
--   with predicate `name IS NOT NULL AND name <> ''`. That means anyone on
--   the internet who has (or guesses) a storage URL can fetch the file with
--   no sign-in. This bypasses CRM team gating entirely.
--
-- Fix:
--   Replace the two open SELECT policies with CRM-member-only policies.
--   Email recipients (who never sign in) will continue to work because the
--   app now embeds 30-day signed URLs (createSignedUrl) instead of public
--   URLs. Signed URLs include their own HMAC token and bypass RLS.
--
-- Note:
--   - Service role bypasses RLS, so all edge functions (including future
--     server-side signed-URL minting) keep working.
--   - INSERT/UPDATE/DELETE policies are unchanged — owners can still manage
--     their own files.
-- ============================================================

-- 1. email-attachments: replace open SELECT with CRM-member SELECT
DROP POLICY IF EXISTS "Public can read email attachment files by direct URL" ON storage.objects;

CREATE POLICY "CRM members can read email attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND public.is_crm_member(auth.uid())
);

-- 2. crm-assets: replace open SELECT with CRM-member SELECT
DROP POLICY IF EXISTS "Public can read crm asset files by direct URL" ON storage.objects;

CREATE POLICY "CRM members can read crm assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'crm-assets'
  AND public.is_crm_member(auth.uid())
);
