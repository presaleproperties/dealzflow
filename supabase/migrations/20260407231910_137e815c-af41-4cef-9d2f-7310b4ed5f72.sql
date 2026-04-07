
-- Add new columns
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS email_secondary text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS co_buyer_birthday text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'lead';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS projects text[] NOT NULL DEFAULT '{}';

-- Create helper function for tags conversion
CREATE OR REPLACE FUNCTION public.jsonb_to_text_array(val jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result text[] := '{}';
  elem text;
BEGIN
  IF val IS NULL OR val::text = '[]' OR val::text = 'null' THEN
    RETURN '{}';
  END IF;
  FOR elem IN SELECT jsonb_array_elements_text(val)
  LOOP
    result := array_append(result, elem);
  END LOOP;
  RETURN result;
END;
$$;

-- Drop existing jsonb default, convert to text[], set new default
ALTER TABLE crm_contacts ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE crm_contacts ALTER COLUMN tags TYPE text[] USING public.jsonb_to_text_array(tags);
ALTER TABLE crm_contacts ALTER COLUMN tags SET DEFAULT '{}';

-- Clean up helper
DROP FUNCTION public.jsonb_to_text_array(jsonb);

-- Check constraint on contact_type
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_contact_type_check CHECK (contact_type IN ('lead', 'realtor', 'past_client'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_contacts_contact_type ON crm_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_source ON crm_contacts(source);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_to ON crm_contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_type ON crm_contacts(lead_type);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_language ON crm_contacts(language);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_projects ON crm_contacts USING GIN(projects);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON crm_contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_created_at ON crm_contacts(created_at);
