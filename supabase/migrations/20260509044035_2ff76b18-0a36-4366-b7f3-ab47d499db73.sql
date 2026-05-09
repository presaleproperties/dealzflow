ALTER TABLE public.crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_contact_type_check;
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_contact_type_check
  CHECK (contact_type = ANY (ARRAY['lead','realtor','past_client','buyer','investor','developer']));