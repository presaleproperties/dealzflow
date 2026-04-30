-- Helper: did the calling user create this template?
CREATE OR REPLACE FUNCTION public.crm_template_is_my_team_contribution(_created_by_agent_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _created_by_agent_slug IS NOT NULL
    AND _created_by_agent_slug = public.crm_my_presale_slug()
$$;

-- INSERT: any agent can create personal OR team template (team must be authored by caller)
DROP POLICY IF EXISTS "Agents insert own or team scoped templates" ON public.crm_email_templates;
CREATE POLICY "Agents insert own or team templates"
  ON public.crm_email_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    is_crm_agent_or_above(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (
        owner_scope = 'team:presale'
        AND owner_agent_slug IS NULL
        AND created_by_agent_slug IS NOT NULL
        AND created_by_agent_slug = crm_my_presale_slug()
      )
      OR is_crm_admin(auth.uid())
    )
  );

-- UPDATE: own personal, own team contribution, or admin
DROP POLICY IF EXISTS "Agents update own, admins update team" ON public.crm_email_templates;
CREATE POLICY "Agents update own/own-team, admins update any"
  ON public.crm_email_templates FOR UPDATE
  TO authenticated
  USING (
    is_crm_member(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (owner_scope = 'team:presale' AND crm_template_is_my_team_contribution(created_by_agent_slug))
      OR is_crm_admin(auth.uid())
    )
  )
  WITH CHECK (
    (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
    OR (owner_scope = 'team:presale' AND (crm_template_is_my_team_contribution(created_by_agent_slug) OR is_crm_admin(auth.uid())))
  );

-- DELETE: own personal, own team contribution, or admin
DROP POLICY IF EXISTS "Agents delete own, admins delete team" ON public.crm_email_templates;
CREATE POLICY "Agents delete own/own-team, admins delete any"
  ON public.crm_email_templates FOR DELETE
  TO authenticated
  USING (
    is_crm_member(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (owner_scope = 'team:presale' AND crm_template_is_my_team_contribution(created_by_agent_slug))
      OR is_crm_admin(auth.uid())
    )
  );