UPDATE public.crm_email_settings AS s
SET sender_name = 'Presale Properties | ' || split_part(t.display_name, ' ', 1),
    updated_at = now()
FROM public.crm_team AS t
WHERE t.user_id = s.user_id
  AND t.email ILIKE '%@presaleproperties.com';

CREATE OR REPLACE FUNCTION public.crm_email_settings_normalize_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_email text;
  v_display    text;
  v_first      text;
  v_expected   text;
BEGIN
  SELECT email, display_name INTO v_team_email, v_display
  FROM public.crm_team
  WHERE user_id = NEW.user_id;

  IF v_team_email IS NULL OR v_team_email NOT ILIKE '%@presaleproperties.com' THEN
    RETURN NEW;
  END IF;

  v_first := split_part(COALESCE(v_display, ''), ' ', 1);
  IF v_first = '' THEN
    RETURN NEW;
  END IF;

  v_expected := 'Presale Properties | ' || v_first;

  IF NEW.sender_name IS NULL
     OR btrim(NEW.sender_name) = ''
     OR NEW.sender_name NOT ILIKE 'Presale Properties %' THEN
    NEW.sender_name := v_expected;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_email_settings_normalize_sender ON public.crm_email_settings;
CREATE TRIGGER trg_crm_email_settings_normalize_sender
BEFORE INSERT OR UPDATE OF sender_name ON public.crm_email_settings
FOR EACH ROW
EXECUTE FUNCTION public.crm_email_settings_normalize_sender();