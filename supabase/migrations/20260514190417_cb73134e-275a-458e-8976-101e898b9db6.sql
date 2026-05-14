CREATE OR REPLACE FUNCTION public.zara_can_send_to(_contact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_zara_id uuid;
  v_zara_name text;
  v_assigned text;
  v_tags text[];
  v_enabled boolean;
  v_qstart time;
  v_qend time;
  v_tz text;
  v_now time;
  v_in_quiet boolean;
BEGIN
  SELECT id, display_name INTO v_zara_id, v_zara_name FROM public.crm_team WHERE slug = 'zara' LIMIT 1;
  IF v_zara_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'zara_not_found');
  END IF;

  SELECT enabled, quiet_hours_start, quiet_hours_end, timezone
    INTO v_enabled, v_qstart, v_qend, v_tz
  FROM public.crm_zara_settings WHERE id = 1;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'kill_switch_off');
  END IF;

  SELECT assigned_to::text, tags INTO v_assigned, v_tags
  FROM public.crm_contacts WHERE id = _contact_id;

  IF v_assigned IS NULL OR (v_assigned <> v_zara_id::text AND v_assigned <> COALESCE(v_zara_name, '')) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_assigned_to_zara');
  END IF;

  IF v_tags IS NOT NULL AND 'zara:muted' = ANY(v_tags) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'contact_muted');
  END IF;

  v_now := (now() AT TIME ZONE COALESCE(v_tz, 'America/Vancouver'))::time;
  IF v_qstart > v_qend THEN
    v_in_quiet := (v_now >= v_qstart OR v_now < v_qend);
  ELSE
    v_in_quiet := (v_now >= v_qstart AND v_now < v_qend);
  END IF;

  IF v_in_quiet THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quiet_hours');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'zara_id', v_zara_id);
END;
$function$;