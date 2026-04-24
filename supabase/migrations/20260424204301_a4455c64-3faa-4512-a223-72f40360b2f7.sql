ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS lead_types text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_types ON public.crm_contacts USING GIN(lead_types);

-- Backfill from the existing scalar lead_type
UPDATE public.crm_contacts
   SET lead_types = ARRAY[lead_type]
 WHERE lead_type IS NOT NULL
   AND length(btrim(lead_type)) > 0
   AND (lead_types IS NULL OR cardinality(lead_types) = 0);