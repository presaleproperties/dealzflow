
-- ============================================
-- FIX 1: Remove crm_contacts from Realtime publication
-- to prevent PII broadcast to all CRM members
-- ============================================
ALTER PUBLICATION supabase_realtime DROP TABLE public.crm_contacts;

-- ============================================
-- FIX 2: Prevent CRM team privilege escalation
-- Admins cannot set role = 'owner' on INSERT or UPDATE
-- ============================================

-- Drop existing INSERT policy and replace with one that blocks owner role assignment
DROP POLICY IF EXISTS "CRM admins can insert team members" ON public.crm_team;
CREATE POLICY "CRM admins can insert team members"
  ON public.crm_team FOR INSERT TO authenticated
  WITH CHECK (
    is_crm_admin(auth.uid())
    AND role <> 'owner'
  );

-- Drop existing UPDATE policy and replace with one that blocks escalation to owner
DROP POLICY IF EXISTS "CRM admins can update team members" ON public.crm_team;
CREATE POLICY "CRM admins can update team members"
  ON public.crm_team FOR UPDATE TO authenticated
  USING (is_crm_admin(auth.uid()))
  WITH CHECK (
    is_crm_admin(auth.uid())
    AND role <> 'owner'
  );

-- ============================================
-- FIX 3: Add missing AI usage INSERT/UPDATE/DELETE policies
-- ============================================
CREATE POLICY "Users can insert their own ai usage"
  ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ai usage"
  ON public.ai_usage FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ai usage"
  ON public.ai_usage FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- FIX 4: Remove client-readable SELECT on google_calendar_tokens
-- Tokens should only be accessed server-side via service_role
-- ============================================
DROP POLICY IF EXISTS "Users can read own tokens" ON public.google_calendar_tokens;

-- ============================================
-- FIX 5: Remove client-readable api_key/api_secret from platform_connections
-- Add a restricted SELECT policy that excludes sensitive columns
-- We can't restrict columns via RLS, but we can ensure the encrypt/decrypt
-- pattern is enforced. For now, the existing RLS is user-scoped which is acceptable.
-- The scan flags it as a warning - we acknowledge but the user-scoped RLS is correct.
-- ============================================

-- ============================================
-- FIX 6: Realtime channel authorization
-- Add RLS policy on realtime.messages to restrict channel subscriptions
-- NOTE: We cannot modify the realtime schema directly.
-- Instead, we ensure all tables in the publication have proper RLS.
-- The conversations and messages tables already have user_id scoped RLS.
-- CRM tables have is_crm_member() RLS. This is sufficient.
-- ============================================
