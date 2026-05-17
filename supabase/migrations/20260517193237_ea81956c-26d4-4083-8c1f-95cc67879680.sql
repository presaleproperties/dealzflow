
-- Profiles uses synthetic id (gen_random_uuid) + user_id (auth.uid). All callers
-- pass auth.uid() into FK columns like uploaded_by, so we must point the FKs
-- at profiles.user_id, not profiles.id. Add a unique index on user_id so it
-- can be a FK target, then re-point every profiles FK and switch to SET NULL.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx ON public.profiles(user_id);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE USING INDEX profiles_user_id_unique_idx;

DO $$
DECLARE
  r record;
  newdef text;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl,
           a.attname AS col, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype='f'
      AND c.confrelid = 'public.profiles'::regclass
      AND (SELECT attname FROM pg_attribute WHERE attrelid = c.confrelid AND attnum = c.confkey[1]) = 'id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(user_id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END$$;

-- ensure_profile() — idempotent profile row creation. Used by trigger + backfill.
CREATE OR REPLACE FUNCTION public.ensure_profile_for_user(_user_id uuid, _full_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (_user_id, _full_name)
  ON CONFLICT (user_id) DO NOTHING;
END$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_profile_for_user(
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS on_auth_user_created_ensure_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_ensure_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill any stragglers (no-op given current counts, defensive).
INSERT INTO public.profiles (user_id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
