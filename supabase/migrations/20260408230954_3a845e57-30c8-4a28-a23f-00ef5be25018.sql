-- Add sync columns to crm_contacts
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'manual';
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS lofty_synced_at timestamptz;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS lofty_updated_at timestamptz;

-- Add indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_lofty_id ON crm_contacts(lofty_id) WHERE lofty_id IS NOT NULL;

-- Create sync log table
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'zapier_lofty',
  event_type text,
  lofty_lead_id text,
  contact_email text,
  contact_name text,
  status text DEFAULT 'success',
  error_message text,
  payload_preview text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM admins can view sync logs"
  ON crm_sync_log FOR SELECT
  USING (is_crm_admin(auth.uid()));