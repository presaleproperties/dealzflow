-- 1. Helper: caller's presale slug
CREATE OR REPLACE FUNCTION public.crm_my_presale_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slug FROM public.crm_team
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1
$$;

-- 2. New columns
ALTER TABLE public.crm_email_templates
  ADD COLUMN IF NOT EXISTS owner_scope text NOT NULL DEFAULT 'team:presale',
  ADD COLUMN IF NOT EXISTS owner_agent_slug text,
  ADD COLUMN IF NOT EXISTS created_by_agent_slug text;

-- 3. Format constraint
ALTER TABLE public.crm_email_templates
  DROP CONSTRAINT IF EXISTS crm_email_templates_owner_scope_format;
ALTER TABLE public.crm_email_templates
  ADD CONSTRAINT crm_email_templates_owner_scope_format
  CHECK (owner_scope ~ '^(agent:[a-z0-9-]+|team:[a-z0-9-]+)$');

-- 4. Consistency: owner_agent_slug must be set iff scope is agent:*
ALTER TABLE public.crm_email_templates
  DROP CONSTRAINT IF EXISTS crm_email_templates_owner_scope_consistency;
ALTER TABLE public.crm_email_templates
  ADD CONSTRAINT crm_email_templates_owner_scope_consistency
  CHECK (
    (owner_scope LIKE 'agent:%' AND owner_agent_slug IS NOT NULL)
    OR (owner_scope LIKE 'team:%' AND owner_agent_slug IS NULL)
  );

-- 5. Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_scope
  ON public.crm_email_templates (owner_scope, owner_agent_slug);

-- 6. Replace SELECT policy with scoped visibility
DROP POLICY IF EXISTS "CRM members can view templates" ON public.crm_email_templates;
CREATE POLICY "CRM members can view scoped templates"
  ON public.crm_email_templates FOR SELECT
  TO authenticated
  USING (
    is_crm_member(auth.uid())
    AND (
      owner_scope LIKE 'team:%'
      OR (owner_agent_slug IS NOT NULL AND owner_agent_slug = crm_my_presale_slug())
      OR is_crm_admin(auth.uid())
    )
  );

-- 7. Replace UPDATE policy: own agent templates OR team (admin only)
DROP POLICY IF EXISTS "CRM agents+ can update templates" ON public.crm_email_templates;
CREATE POLICY "Agents update own, admins update team"
  ON public.crm_email_templates FOR UPDATE
  TO authenticated
  USING (
    is_crm_member(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (owner_scope LIKE 'team:%' AND is_crm_admin(auth.uid()))
    )
  )
  WITH CHECK (
    (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
    OR (owner_scope LIKE 'team:%' AND is_crm_admin(auth.uid()))
  );

-- 8. Replace DELETE policy: own agent templates OR team (admin only)
DROP POLICY IF EXISTS "CRM admins can delete templates" ON public.crm_email_templates;
CREATE POLICY "Agents delete own, admins delete team"
  ON public.crm_email_templates FOR DELETE
  TO authenticated
  USING (
    is_crm_member(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (owner_scope LIKE 'team:%' AND is_crm_admin(auth.uid()))
    )
  );

-- 9. INSERT policy stays open to agents+ but enforces scope consistency via WITH CHECK
DROP POLICY IF EXISTS "CRM agents+ can insert templates" ON public.crm_email_templates;
CREATE POLICY "Agents insert own or team scoped templates"
  ON public.crm_email_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    is_crm_agent_or_above(auth.uid())
    AND (
      (owner_scope LIKE 'agent:%' AND owner_agent_slug = crm_my_presale_slug())
      OR (owner_scope = 'team:presale' AND is_crm_admin(auth.uid()))
    )
  );