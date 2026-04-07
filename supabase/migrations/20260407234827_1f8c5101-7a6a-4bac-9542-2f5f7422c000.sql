
-- Tighten user_roles SELECT to authenticated only
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Authenticated users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Tighten CRM INSERT: admins can only add agents/viewers, only owners can add admins
DROP POLICY IF EXISTS "CRM admins can insert team members" ON public.crm_team;
CREATE POLICY "CRM admins can insert team members"
  ON public.crm_team FOR INSERT TO authenticated
  WITH CHECK (
    is_crm_admin(auth.uid())
    AND role <> 'owner'
    AND (role <> 'admin' OR is_crm_owner(auth.uid()))
  );
