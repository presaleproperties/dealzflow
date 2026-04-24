
-- Dedicated tags table for the CRM
CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_lower text GENERATED ALWAYS AS (lower(name)) STORED,
  color text,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_tags_name_lower_unique ON public.crm_tags (name_lower);
CREATE INDEX IF NOT EXISTS crm_tags_usage_idx ON public.crm_tags (usage_count DESC, name_lower);

-- RLS — readable & writable by any CRM team member (matches other crm_* tables)
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM members can view tags" ON public.crm_tags;
CREATE POLICY "CRM members can view tags"
  ON public.crm_tags FOR SELECT
  TO authenticated
  USING (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "CRM members can insert tags" ON public.crm_tags;
CREATE POLICY "CRM members can insert tags"
  ON public.crm_tags FOR INSERT
  TO authenticated
  WITH CHECK (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "CRM members can update tags" ON public.crm_tags;
CREATE POLICY "CRM members can update tags"
  ON public.crm_tags FOR UPDATE
  TO authenticated
  USING (public.is_crm_member(auth.uid()))
  WITH CHECK (public.is_crm_member(auth.uid()));

DROP POLICY IF EXISTS "CRM admins can delete tags" ON public.crm_tags;
CREATE POLICY "CRM admins can delete tags"
  ON public.crm_tags FOR DELETE
  TO authenticated
  USING (public.is_crm_admin(auth.uid()));

-- Seed from existing contacts: every distinct (case-insensitive) tag, with usage counts.
INSERT INTO public.crm_tags (name, usage_count)
SELECT first_label, cnt
FROM (
  SELECT
    lower(t)            AS key,
    (array_agg(t ORDER BY length(t) DESC))[1] AS first_label,
    count(*)::int       AS cnt
  FROM public.crm_contacts c, unnest(c.tags) AS t
  WHERE c.tags IS NOT NULL
    AND length(btrim(t)) > 0
  GROUP BY lower(t)
) src
ON CONFLICT (name_lower) DO UPDATE
  SET usage_count = EXCLUDED.usage_count,
      updated_at  = now();

-- Trigger: keep crm_tags in sync when crm_contacts.tags changes.
CREATE OR REPLACE FUNCTION public.sync_crm_tags_from_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  added text[];
  removed text[];
  t text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    added := COALESCE(NEW.tags, '{}'::text[]);
    removed := '{}'::text[];
  ELSIF TG_OP = 'UPDATE' THEN
    added := COALESCE(
      ARRAY(SELECT unnest(COALESCE(NEW.tags, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(OLD.tags, '{}'::text[]))),
      '{}'::text[]
    );
    removed := COALESCE(
      ARRAY(SELECT unnest(COALESCE(OLD.tags, '{}'::text[]))
            EXCEPT
            SELECT unnest(COALESCE(NEW.tags, '{}'::text[]))),
      '{}'::text[]
    );
  ELSIF TG_OP = 'DELETE' THEN
    added := '{}'::text[];
    removed := COALESCE(OLD.tags, '{}'::text[]);
  END IF;

  -- Upsert added tags & bump count
  IF array_length(added, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY added LOOP
      IF length(btrim(t)) > 0 THEN
        INSERT INTO public.crm_tags (name, usage_count)
        VALUES (btrim(t), 1)
        ON CONFLICT (name_lower) DO UPDATE
          SET usage_count = public.crm_tags.usage_count + 1,
              updated_at  = now();
      END IF;
    END LOOP;
  END IF;

  -- Decrement counts for removed tags (don't delete — keep label history)
  IF array_length(removed, 1) IS NOT NULL THEN
    FOREACH t IN ARRAY removed LOOP
      IF length(btrim(t)) > 0 THEN
        UPDATE public.crm_tags
        SET usage_count = GREATEST(usage_count - 1, 0),
            updated_at  = now()
        WHERE name_lower = lower(btrim(t));
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_tags ON public.crm_contacts;
CREATE TRIGGER trg_sync_crm_tags
  AFTER INSERT OR UPDATE OF tags OR DELETE
  ON public.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_crm_tags_from_contact();
