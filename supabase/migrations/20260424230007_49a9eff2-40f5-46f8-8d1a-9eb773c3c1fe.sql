
CREATE OR REPLACE FUNCTION public.update_last_touch_on_behavior()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts TIMESTAMPTZ;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pick the right timestamp column for the source table via TG_TABLE_NAME
  CASE TG_TABLE_NAME
    WHEN 'crm_lead_behavior_views' THEN
      v_ts := (to_jsonb(NEW)->>'viewed_at')::timestamptz;
    WHEN 'crm_lead_behavior_sessions' THEN
      v_ts := (to_jsonb(NEW)->>'started_at')::timestamptz;
    WHEN 'crm_lead_behavior_forms' THEN
      v_ts := (to_jsonb(NEW)->>'submitted_at')::timestamptz;
    WHEN 'crm_lead_behavior_engagement' THEN
      v_ts := (to_jsonb(NEW)->>'occurred_at')::timestamptz;
    ELSE
      v_ts := now();
  END CASE;

  UPDATE public.crm_contacts
  SET last_touch_at = COALESCE(v_ts, now()),
      last_touch_type = TG_ARGV[0]
  WHERE id = NEW.contact_id;

  RETURN NEW;
END;
$$;
