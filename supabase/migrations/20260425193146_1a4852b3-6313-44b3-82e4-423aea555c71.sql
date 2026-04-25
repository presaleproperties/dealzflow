CREATE UNIQUE INDEX IF NOT EXISTS uniq_crm_contacts_email_lower
  ON public.crm_contacts (lower(email))
  WHERE email IS NOT NULL AND email <> '';