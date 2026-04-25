DROP VIEW IF EXISTS public.crm_potential_duplicates;

CREATE VIEW public.crm_potential_duplicates
WITH (security_invoker = on)
AS
SELECT
  lower(email) AS match_key,
  'email'::text AS match_type,
  array_agg(id ORDER BY last_touch_at DESC NULLS LAST, lead_score DESC) AS contact_ids,
  COUNT(*) AS dup_count
FROM public.crm_contacts
WHERE email IS NOT NULL AND email <> ''
GROUP BY lower(email)
HAVING COUNT(*) > 1
UNION ALL
SELECT
  phone_normalized || '|' || lower(first_name) AS match_key,
  'phone+first_name'::text AS match_type,
  array_agg(id ORDER BY last_touch_at DESC NULLS LAST, lead_score DESC) AS contact_ids,
  COUNT(*) AS dup_count
FROM public.crm_contacts
WHERE phone_normalized IS NOT NULL AND first_name IS NOT NULL AND first_name <> ''
GROUP BY phone_normalized, lower(first_name)
HAVING COUNT(*) > 1;

GRANT SELECT ON public.crm_potential_duplicates TO authenticated;