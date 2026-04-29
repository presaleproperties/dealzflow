
-- 1. Upgrade the signup linker: link, prefill profile, and auto-approve invited agents
CREATE OR REPLACE FUNCTION public.link_crm_team_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team public.crm_team%ROWTYPE;
BEGIN
  -- Find a matching unlinked team row by email
  SELECT * INTO v_team
    FROM public.crm_team
   WHERE user_id IS NULL
     AND lower(email) = lower(NEW.email)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Link the team row to this auth user
  UPDATE public.crm_team
     SET user_id    = NEW.id,
         updated_at = now()
   WHERE id = v_team.id;

  -- Prefill the profile from the team record (only fill blanks)
  UPDATE public.profiles
     SET full_name        = COALESCE(NULLIF(full_name, ''), v_team.display_name),
         phone            = COALESCE(NULLIF(phone, ''),     v_team.phone),
         title            = COALESCE(NULLIF(title, ''),     v_team.title),
         brokerage        = COALESCE(NULLIF(brokerage, ''), v_team.brokerage),
         license_no       = COALESCE(NULLIF(license_no, ''),v_team.license_no),
         avatar_url       = COALESCE(NULLIF(avatar_url, ''),v_team.headshot_url),
         province         = COALESCE(NULLIF(province, ''),  'BC'),
         workspace_status = 'approved',
         approved_at      = COALESCE(approved_at, now()),
         approved_by      = COALESCE(approved_by, v_team.invited_by),
         updated_at       = now()
   WHERE user_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- 2. Backfill: prefill profiles for already-linked team members whose profile is missing info
UPDATE public.profiles p
   SET full_name        = COALESCE(NULLIF(p.full_name, ''),  t.display_name),
       phone            = COALESCE(NULLIF(p.phone, ''),      t.phone),
       title            = COALESCE(NULLIF(p.title, ''),      t.title),
       brokerage        = COALESCE(NULLIF(p.brokerage, ''),  t.brokerage),
       license_no       = COALESCE(NULLIF(p.license_no, ''), t.license_no),
       avatar_url       = COALESCE(NULLIF(p.avatar_url, ''), t.headshot_url),
       province         = COALESCE(NULLIF(p.province, ''),   'BC'),
       workspace_status = CASE WHEN p.workspace_status = 'pending' THEN 'approved'::workspace_status ELSE p.workspace_status END,
       approved_at      = COALESCE(p.approved_at, now()),
       approved_by      = COALESCE(p.approved_by, t.invited_by),
       updated_at       = now()
  FROM public.crm_team t
 WHERE t.user_id = p.user_id
   AND t.is_active = true;
