CREATE OR REPLACE FUNCTION public.crm_recipients_for_contact(_assigned_to text)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Assigned: route ONLY to that agent. If the name doesn't match any
    -- active team member, return empty (do NOT fall back to owner) so the
    -- owner isn't pinged for work they delegated.
    WHEN _assigned_to IS NOT NULL AND btrim(_assigned_to) <> '' THEN
      COALESCE(
        (SELECT array_agg(DISTINCT t.user_id)
           FROM public.crm_team t
          WHERE t.is_active = true
            AND (
              lower(t.display_name) = lower(_assigned_to)
              OR lower(_assigned_to) = ANY (SELECT lower(a) FROM unnest(t.name_aliases) AS a)
            )),
        ARRAY[]::uuid[]
      )
    -- Unassigned: route to owner + admins so nothing slips through
    ELSE
      COALESCE(
        (SELECT array_agg(user_id) FROM public.crm_team
          WHERE is_active = true AND role IN ('owner', 'admin')),
        ARRAY[]::uuid[]
      )
  END;
$function$;