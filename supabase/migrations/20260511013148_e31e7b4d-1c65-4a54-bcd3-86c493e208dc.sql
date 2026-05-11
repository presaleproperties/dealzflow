-- One-time cleanup: re-link orphan Presale activity events that arrived
-- before the contact was matched, and merge the duplicate "New" placeholder
-- created for laxman.saih@gmail.com into the real lead 308146c7…

-- 1. Re-link any orphan activity events for this email to the real contact
UPDATE crm_activity_events
SET contact_id = '308146c7-b853-4c5c-bcc4-79a33c5512a8'
WHERE contact_id IS NULL
  AND lower(lead_email) = 'laxman.saih@gmail.com';

-- 2. Move all activity events from the bad duplicate into the real contact
UPDATE crm_activity_events
SET contact_id = '308146c7-b853-4c5c-bcc4-79a33c5512a8'
WHERE contact_id = '7180e706-8db2-410b-b4b9-016d07b95ef0';

-- 3. Move identities, notes, tasks, etc. (best-effort; ignore if tables absent)
DO $$
BEGIN
  -- crm_contact_identities: re-point to real contact, ignore conflicts
  BEGIN
    UPDATE crm_contact_identities
    SET contact_id = '308146c7-b853-4c5c-bcc4-79a33c5512a8',
        is_primary = false
    WHERE contact_id = '7180e706-8db2-410b-b4b9-016d07b95ef0'
      AND NOT EXISTS (
        SELECT 1 FROM crm_contact_identities x
        WHERE x.contact_id = '308146c7-b853-4c5c-bcc4-79a33c5512a8'
          AND x.kind = crm_contact_identities.kind
          AND x.value = crm_contact_identities.value
      );
    DELETE FROM crm_contact_identities WHERE contact_id = '7180e706-8db2-410b-b4b9-016d07b95ef0';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- 4. Delete the bad duplicate placeholder (cascade handles dependent rows)
DELETE FROM crm_contacts WHERE id = '7180e706-8db2-410b-b4b9-016d07b95ef0';