-- 1) Owner: rename auth email + confirm it (same user_id, same password)
UPDATE auth.users
SET
  email = 'info@presaleproperties.com',
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE id = '77754636-c2c5-4207-874d-a205954d9507'
  AND email = 'muzair93@hotmail.com';

-- 2) Owner: mirror the new email into crm_team
UPDATE public.crm_team
SET email = 'info@presaleproperties.com',
    updated_at = now()
WHERE id = '2a0db2ac-bd66-4c36-ac66-26754a42e5d2';

-- 3) Ravish: switch to his Workspace email so first-login auto-binds to crm_team
UPDATE public.crm_team
SET email = 'ravish@presaleproperties.com',
    updated_at = now()
WHERE id = '4da56145-56cf-42dd-9ce2-41bdfb6c658b';