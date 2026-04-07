
-- Drop the recursive policies
DROP POLICY IF EXISTS "CRM admins can view all team rows" ON public.crm_team;
DROP POLICY IF EXISTS "CRM admins can insert team members" ON public.crm_team;
DROP POLICY IF EXISTS "CRM admins can update team members" ON public.crm_team;
DROP POLICY IF EXISTS "CRM owners can delete team members" ON public.crm_team;

-- Create security definer function to check CRM role without triggering RLS
CREATE OR REPLACE FUNCTION public.is_crm_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = _user_id
      AND is_active = true
      AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_crm_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team
    WHERE user_id = _user_id
      AND is_active = true
      AND role = 'owner'
  )
$$;

-- Recreate policies using the security definer functions
CREATE POLICY "CRM admins can view all team rows"
  ON public.crm_team FOR SELECT
  TO authenticated
  USING (public.is_crm_admin(auth.uid()));

CREATE POLICY "CRM admins can insert team members"
  ON public.crm_team FOR INSERT
  TO authenticated
  WITH CHECK (public.is_crm_admin(auth.uid()));

CREATE POLICY "CRM admins can update team members"
  ON public.crm_team FOR UPDATE
  TO authenticated
  USING (public.is_crm_admin(auth.uid()));

CREATE POLICY "CRM owners can delete team members"
  ON public.crm_team FOR DELETE
  TO authenticated
  USING (public.is_crm_owner(auth.uid()));
