-- 1. Enum for workspace status
DO $$ BEGIN
  CREATE TYPE public.workspace_status AS ENUM ('pending', 'approved', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS workspace_status public.workspace_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();

-- 3. Grandfather all existing users as approved
UPDATE public.profiles
   SET workspace_status = 'approved',
       approved_at = COALESCE(approved_at, now())
 WHERE workspace_status = 'pending';

-- 4. Update handle_new_user trigger so NEW signups land as pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, workspace_status, requested_at)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'pending', now());

  INSERT INTO public.settings (user_id) VALUES (NEW.id);

  -- Notify admins of pending signup
  INSERT INTO public.crm_notifications (user_id, title, body, type, link_to, is_read, created_at)
  SELECT ur.user_id,
         'New signup awaiting approval',
         COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || ' has requested workspace access',
         'workspace_signup_request',
         '/admin?tab=access',
         false, now()
  FROM public.user_roles ur
  WHERE ur.role = 'admin';

  RETURN NEW;
END;
$function$;

-- 5. Helper: is the current user approved for workspace?
CREATE OR REPLACE FUNCTION public.is_workspace_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = _user_id
       AND workspace_status = 'approved'
  );
$$;

-- 6. Admin-only: approve / suspend / re-pending a user
CREATE OR REPLACE FUNCTION public.admin_set_workspace_status(
  _target_user_id uuid,
  _status public.workspace_status,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text;
  v_name text;
BEGIN
  IF NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Only admins can change workspace status';
  END IF;

  UPDATE public.profiles
     SET workspace_status = _status,
         approved_at = CASE WHEN _status = 'approved' THEN now() ELSE approved_at END,
         approved_by = CASE WHEN _status = 'approved' THEN v_actor ELSE approved_by END,
         denial_reason = CASE WHEN _status = 'suspended' THEN _reason ELSE NULL END,
         updated_at = now()
   WHERE user_id = _target_user_id
   RETURNING full_name INTO v_name;

  RETURN jsonb_build_object('user_id', _target_user_id, 'status', _status, 'name', v_name);
END;
$$;

-- 7. RLS: admins can view all profiles (for the access-request queue)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update workspace status" ON public.profiles;
CREATE POLICY "Admins can update workspace status"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 8. Index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_status
  ON public.profiles(workspace_status, requested_at DESC);