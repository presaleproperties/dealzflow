
-- ============================================
-- CRITICAL: Lock down user_roles table
-- Prevent any user from self-granting admin role
-- ============================================
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- Also add a SELECT policy so users can check their own role
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- ============================================
-- Prevent CRM admins from updating their OWN role
-- ============================================
DROP POLICY IF EXISTS "CRM admins can update team members" ON public.crm_team;
CREATE POLICY "CRM admins can update team members"
  ON public.crm_team FOR UPDATE TO authenticated
  USING (is_crm_admin(auth.uid()))
  WITH CHECK (
    is_crm_admin(auth.uid())
    AND role <> 'owner'
    AND user_id <> auth.uid()
  );
