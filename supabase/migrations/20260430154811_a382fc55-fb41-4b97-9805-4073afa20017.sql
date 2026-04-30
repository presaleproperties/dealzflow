
-- 1) PROFILES: Remove broad team-visible SELECT
DROP POLICY IF EXISTS "Authenticated users can view team profiles" ON public.profiles;

-- 2) GMAIL MESSAGES: Restrict SELECT to owner or admin
DROP POLICY IF EXISTS "CRM members can view gmail messages" ON public.crm_gmail_messages;
CREATE POLICY "Owner or admin can view gmail messages"
ON public.crm_gmail_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_crm_admin(auth.uid()));

-- 3) SMS LOG: Restrict DELETE to admin or sender (and visible contact)
DROP POLICY IF EXISTS "CRM members can delete SMS" ON public.crm_sms_log;
CREATE POLICY "Admins or sender can delete SMS"
ON public.crm_sms_log
FOR DELETE
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (auth.uid() = user_id AND public.is_crm_member(auth.uid()))
);

-- 3b) Tighten SMS UPDATE to admin or sender
DROP POLICY IF EXISTS "CRM members can update SMS" ON public.crm_sms_log;
CREATE POLICY "Admins or sender can update SMS"
ON public.crm_sms_log
FOR UPDATE
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (auth.uid() = user_id AND public.is_crm_member(auth.uid()))
)
WITH CHECK (
  public.is_crm_admin(auth.uid())
  OR (auth.uid() = user_id AND public.is_crm_member(auth.uid()))
);

-- 4) LEAD BEHAVIOR TABLES: Scope SELECT to assigned-agent visibility
-- crm_can_see_contact_id already enforces "admin OR assigned agent OR unassigned-fallback".
DROP POLICY IF EXISTS "CRM members view behavior views" ON public.crm_lead_behavior_views;
CREATE POLICY "Visible-contact view behavior views"
ON public.crm_lead_behavior_views
FOR SELECT
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

DROP POLICY IF EXISTS "CRM members view engagement" ON public.crm_lead_behavior_engagement;
CREATE POLICY "Visible-contact view engagement"
ON public.crm_lead_behavior_engagement
FOR SELECT
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

DROP POLICY IF EXISTS "CRM members view sessions" ON public.crm_lead_behavior_sessions;
CREATE POLICY "Visible-contact view sessions"
ON public.crm_lead_behavior_sessions
FOR SELECT
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

DROP POLICY IF EXISTS "CRM members view forms" ON public.crm_lead_behavior_forms;
CREATE POLICY "Visible-contact view forms"
ON public.crm_lead_behavior_forms
FOR SELECT
TO authenticated
USING (
  public.is_crm_admin(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

-- 5) TEAM INVITES: Allow invitee to read their own pending invite by email
CREATE POLICY "Invitee can read own invite by email"
ON public.crm_team_invites
FOR SELECT
TO authenticated
USING (
  lower(email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
);
