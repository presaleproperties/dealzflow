-- Per-agent duplicate detection.
--
-- Problem: AddLeadDialog runs a broad SELECT on crm_contacts to warn about
-- duplicates by email / phone. Owners and admins can see ALL contacts via
-- crm_can_see_contact, so they get a "duplicate" prompt even when the
-- existing record belongs to another agent. The user wants duplicate
-- detection to only consider leads in *the calling agent's own assignment
-- bucket* — Sarb adding a contact that Zara already owns should NOT trip
-- the dup warning.
--
-- This RPC is SECURITY DEFINER so it deliberately ignores the broad admin
-- visibility and scopes matches to the caller's display_name + name aliases
-- (same identity logic used elsewhere in crm_can_see_contact). Unassigned
-- contacts are excluded — those are not "my leads" yet.

CREATE OR REPLACE FUNCTION public.crm_find_my_duplicates(
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  status text,
  assigned_to text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email_norm text := nullif(lower(trim(_email)), '');
  _phone_last10 text := nullif(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), '');
  _me_names text[];
BEGIN
  -- Need at least one signal to match on
  IF _email_norm IS NULL AND (_phone_last10 IS NULL OR length(_phone_last10) < 7) THEN
    RETURN;
  END IF;

  IF _phone_last10 IS NOT NULL THEN
    _phone_last10 := right(_phone_last10, 10);
  END IF;

  -- Resolve caller -> their crm_team identity (display_name + aliases),
  -- lowercased. If the caller isn't on an active team, no scope = no matches.
  SELECT array_agg(DISTINCT n) INTO _me_names
  FROM (
    SELECT lower(t.display_name) AS n
      FROM public.crm_team t
     WHERE t.user_id = auth.uid()
       AND t.is_active = true
       AND t.display_name IS NOT NULL
    UNION
    SELECT lower(a) AS n
      FROM public.crm_team t,
           LATERAL unnest(coalesce(t.name_aliases, ARRAY[]::text[])) AS a
     WHERE t.user_id = auth.uid()
       AND t.is_active = true
  ) s
  WHERE n IS NOT NULL AND n <> '';

  IF _me_names IS NULL OR array_length(_me_names, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.status, c.assigned_to
    FROM public.crm_contacts c
   WHERE c.assigned_to IS NOT NULL
     AND lower(c.assigned_to) = ANY (_me_names)
     AND (
       (_email_norm IS NOT NULL AND (
            lower(c.email) = _email_norm
         OR lower(c.email_secondary) = _email_norm
       ))
       OR (_phone_last10 IS NOT NULL AND (
            right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = _phone_last10
         OR right(regexp_replace(coalesce(c.phone_secondary, ''), '\D', '', 'g'), 10) = _phone_last10
       ))
     )
   ORDER BY c.last_touch_at DESC NULLS LAST
   LIMIT greatest(1, least(coalesce(_limit, 5), 25));
END;
$$;

REVOKE ALL ON FUNCTION public.crm_find_my_duplicates(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_find_my_duplicates(text, text, integer) TO authenticated;