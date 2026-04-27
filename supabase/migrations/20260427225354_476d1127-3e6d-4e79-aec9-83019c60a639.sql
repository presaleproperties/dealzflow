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
  v_name text;
  v_title text;
  v_body text;
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

  -- Notify the user in-app
  IF _status = 'approved' THEN
    v_title := 'Welcome aboard 🎉';
    v_body := 'Your workspace access has been approved. You can now use the app.';
  ELSIF _status = 'suspended' THEN
    v_title := 'Account suspended';
    v_body := COALESCE('Your access has been paused. Reason: ' || _reason, 'Your access has been paused.');
  ELSE
    v_title := 'Access set to pending';
    v_body := 'Your workspace access is awaiting review.';
  END IF;

  INSERT INTO public.crm_notifications (user_id, title, body, type, link_to, is_read, created_at)
  VALUES (_target_user_id, v_title, v_body, 'workspace_status_change', '/dashboard', false, now());

  RETURN jsonb_build_object('user_id', _target_user_id, 'status', _status, 'name', v_name);
END;
$$;