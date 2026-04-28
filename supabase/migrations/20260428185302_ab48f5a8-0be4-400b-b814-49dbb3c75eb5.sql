-- =====================================================================
-- Team management + per-agent lead isolation
-- =====================================================================

-- 1. Schema additions to crm_team
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS name_aliases text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS crm_team_email_lower_idx
  ON public.crm_team (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_team_display_name_lower_idx
  ON public.crm_team (lower(display_name));

-- 2. Insert Sarb + Ravish (user_id NULL — backfilled on signup via trigger)
-- First, allow NULL user_id for invited-but-not-yet-signed-up agents
ALTER TABLE public.crm_team ALTER COLUMN user_id DROP NOT NULL;

INSERT INTO public.crm_team (user_id, display_name, email, role, is_active, permissions, invited_at)
VALUES
  (NULL, 'Sarb Grewal', 'sarb@presaleproperties.com', 'agent', true,
   '{"see_all_leads": false, "delete_leads": false, "export_leads": false, "manage_templates": false, "manage_routing": false, "manage_team": false, "reassign_leads": false}'::jsonb,
   now()),
  (NULL, 'Ravish Passy', 'realestatewithravish@gmail.com', 'agent', true,
   '{"see_all_leads": false, "delete_leads": false, "export_leads": false, "manage_templates": false, "manage_routing": false, "manage_team": false, "reassign_leads": false}'::jsonb,
   now())
ON CONFLICT DO NOTHING;

-- Backfill email for existing rows where missing (Uzair)
UPDATE public.crm_team t
   SET email = u.email
  FROM auth.users u
 WHERE t.user_id = u.id AND t.email IS NULL;

-- 3. Auto-link crm_team rows to auth.users on signup (matches by email)
CREATE OR REPLACE FUNCTION public.link_crm_team_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_team
     SET user_id = NEW.id,
         updated_at = now()
   WHERE user_id IS NULL
     AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_crm_team_on_signup ON auth.users;
CREATE TRIGGER trg_link_crm_team_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_crm_team_on_signup();

-- 4. Permission helper
CREATE OR REPLACE FUNCTION public.crm_has_perm(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_team
     WHERE user_id = _user_id
       AND is_active = true
       AND (
         role IN ('owner', 'admin')
         OR COALESCE((permissions->>_perm)::boolean, false) = true
       )
  );
$$;

-- 5. Core visibility check — does this user see this lead?
CREATE OR REPLACE FUNCTION public.crm_can_see_contact(_user_id uuid, _assigned_to text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Permissive fallback: if no team configured, allow (preserves current behavior pre-onboarding)
    NOT EXISTS (SELECT 1 FROM public.crm_team WHERE is_active = true)
    OR EXISTS (
      SELECT 1 FROM public.crm_team t
       WHERE t.user_id = _user_id
         AND t.is_active = true
         AND (
           t.role IN ('owner', 'admin')
           OR COALESCE((t.permissions->>'see_all_leads')::boolean, false) = true
           OR (
             _assigned_to IS NOT NULL
             AND (
               lower(_assigned_to) = lower(t.display_name)
               OR lower(_assigned_to) = ANY (SELECT lower(a) FROM unnest(t.name_aliases) AS a)
             )
           )
         )
    );
$$;

-- 6. Helper: can this user see the contact identified by _contact_id?
CREATE OR REPLACE FUNCTION public.crm_can_see_contact_id(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_can_see_contact(
    _user_id,
    (SELECT assigned_to FROM public.crm_contacts WHERE id = _contact_id)
  );
$$;

-- =====================================================================
-- 7. RLS: crm_contacts — replace SELECT/UPDATE/DELETE with isolation
-- =====================================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'crm_contacts'
       AND cmd IN ('SELECT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_contacts', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "crm_contacts_select_assigned"
  ON public.crm_contacts FOR SELECT
  TO authenticated
  USING (public.crm_can_see_contact(auth.uid(), assigned_to));

CREATE POLICY "crm_contacts_update_assigned"
  ON public.crm_contacts FOR UPDATE
  TO authenticated
  USING (public.crm_can_see_contact(auth.uid(), assigned_to))
  WITH CHECK (public.crm_can_see_contact(auth.uid(), assigned_to));

CREATE POLICY "crm_contacts_delete"
  ON public.crm_contacts FOR DELETE
  TO authenticated
  USING (
    public.crm_can_see_contact(auth.uid(), assigned_to)
    AND public.crm_has_perm(auth.uid(), 'delete_leads')
  );

-- =====================================================================
-- 8. RLS: child tables (notes, email_log, sms_log, tasks, showings, messages, conversations)
--     SELECT gated through crm_can_see_contact_id
-- =====================================================================

-- crm_notes
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_notes' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_notes', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_notes_select_visible_contact"
  ON public.crm_notes FOR SELECT TO authenticated
  USING (public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_email_log
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_email_log' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_email_log', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_email_log_select_visible_contact"
  ON public.crm_email_log FOR SELECT TO authenticated
  USING (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_sms_log
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_sms_log' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_sms_log', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_sms_log_select_visible_contact"
  ON public.crm_sms_log FOR SELECT TO authenticated
  USING (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_tasks
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_tasks' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_tasks', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_tasks_select_visible_contact"
  ON public.crm_tasks FOR SELECT TO authenticated
  USING (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_showings
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_showings' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_showings', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_showings_select_visible_contact"
  ON public.crm_showings FOR SELECT TO authenticated
  USING (public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_messages
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_messages' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_messages', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_messages_select_visible_contact"
  ON public.crm_messages FOR SELECT TO authenticated
  USING (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id));

-- crm_conversations
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='crm_conversations' AND cmd='SELECT'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_conversations', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "crm_conversations_select_visible_contact"
  ON public.crm_conversations FOR SELECT TO authenticated
  USING (contact_id IS NULL OR public.crm_can_see_contact_id(auth.uid(), contact_id));

-- =====================================================================
-- 9. Team management RPCs (admin/owner-gated)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.crm_team_invite(
  _email text, _display_name text, _role text DEFAULT 'agent', _permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_user uuid;
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM owners/admins can invite team members';
  END IF;
  IF _email IS NULL OR btrim(_email) = '' THEN RAISE EXCEPTION 'email required'; END IF;
  IF _display_name IS NULL OR btrim(_display_name) = '' THEN RAISE EXCEPTION 'display_name required'; END IF;
  IF _role NOT IN ('owner','admin','agent','viewer') THEN RAISE EXCEPTION 'invalid role'; END IF;

  -- Try matching an existing auth user by email
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;

  INSERT INTO public.crm_team (user_id, display_name, email, role, is_active, permissions, invited_at, invited_by)
  VALUES (v_user, btrim(_display_name), lower(btrim(_email)), _role, true,
          COALESCE(_permissions, '{}'::jsonb), now(), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'user_id', v_user, 'linked', v_user IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_team_update(
  _team_id uuid, _role text, _permissions jsonb, _is_active boolean, _name_aliases text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_crm_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only CRM owners/admins can update team members';
  END IF;
  UPDATE public.crm_team
     SET role = COALESCE(_role, role),
         permissions = COALESCE(_permissions, permissions),
         is_active = COALESCE(_is_active, is_active),
         name_aliases = COALESCE(_name_aliases, name_aliases),
         updated_at = now()
   WHERE id = _team_id;
END;
$$;