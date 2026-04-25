DELETE FROM public.crm_contacts
WHERE (email IS NULL OR btrim(email) = '')
  AND (phone IS NULL OR btrim(phone) = '');