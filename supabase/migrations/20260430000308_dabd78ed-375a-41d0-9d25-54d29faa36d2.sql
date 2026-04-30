-- Per-agent duplicate detection (crm_find_my_duplicates) is the source of truth.
-- A global unique index on lower(email) makes it impossible for two agents to
-- own the same lead, which contradicts the documented behavior. Drop it; keep
-- the non-unique lookup index so email searches stay fast.
DROP INDEX IF EXISTS public.uniq_crm_contacts_email_lower;