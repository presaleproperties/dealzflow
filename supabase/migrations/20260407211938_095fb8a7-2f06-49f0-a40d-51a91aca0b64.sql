
CREATE TABLE public.crm_team (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'agent',
  display_name TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id)
);

ALTER TABLE public.crm_team ENABLE ROW LEVEL SECURITY;

-- Members can view their own row
CREATE POLICY "Users can view own crm_team row"
  ON public.crm_team FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owners and admins can view all team members
CREATE POLICY "CRM admins can view all team rows"
  ON public.crm_team FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_team ct
      WHERE ct.user_id = auth.uid()
        AND ct.is_active = true
        AND ct.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can insert new team members
CREATE POLICY "CRM admins can insert team members"
  ON public.crm_team FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_team ct
      WHERE ct.user_id = auth.uid()
        AND ct.is_active = true
        AND ct.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update team members
CREATE POLICY "CRM admins can update team members"
  ON public.crm_team FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_team ct
      WHERE ct.user_id = auth.uid()
        AND ct.is_active = true
        AND ct.role IN ('owner', 'admin')
    )
  );

-- Owners can delete team members
CREATE POLICY "CRM owners can delete team members"
  ON public.crm_team FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_team ct
      WHERE ct.user_id = auth.uid()
        AND ct.is_active = true
        AND ct.role = 'owner'
    )
  );
