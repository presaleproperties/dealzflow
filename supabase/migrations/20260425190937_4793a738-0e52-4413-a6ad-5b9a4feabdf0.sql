-- 1. Library table (mirrors crm_tags shape)
CREATE TABLE IF NOT EXISTS public.crm_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_sources_name_lower_unique UNIQUE (name_lower)
);

ALTER TABLE public.crm_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can read sources"
  ON public.crm_sources FOR SELECT
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM agents can insert sources"
  ON public.crm_sources FOR INSERT
  WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM agents can update sources"
  ON public.crm_sources FOR UPDATE
  USING (public.is_crm_agent_or_above(auth.uid()));

CREATE POLICY "CRM admins can delete sources"
  ON public.crm_sources FOR DELETE
  USING (public.is_crm_admin(auth.uid()));

CREATE TRIGGER trg_crm_sources_updated_at
  BEFORE UPDATE ON public.crm_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Sync trigger (mirrors sync_crm_tags_from_contact)
CREATE OR REPLACE FUNCTION public.sync_crm_sources_from_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_src TEXT := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN btrim(OLD.source) ELSE NULL END;
  new_src TEXT := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN btrim(NEW.source) ELSE NULL END;
BEGIN
  -- Decrement old (when changed/removed)
  IF old_src IS NOT NULL AND length(old_src) > 0
     AND (TG_OP = 'DELETE' OR old_src IS DISTINCT FROM new_src) THEN
    UPDATE public.crm_sources
       SET usage_count = GREATEST(usage_count - 1, 0),
           updated_at = now()
     WHERE name_lower = lower(old_src);
  END IF;

  -- Increment new (insert / changed)
  IF new_src IS NOT NULL AND length(new_src) > 0
     AND (TG_OP = 'INSERT' OR new_src IS DISTINCT FROM old_src) THEN
    INSERT INTO public.crm_sources (name, usage_count)
    VALUES (new_src, 1)
    ON CONFLICT (name_lower) DO UPDATE
      SET usage_count = public.crm_sources.usage_count + 1,
          updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_sources ON public.crm_contacts;
CREATE TRIGGER trg_sync_crm_sources
  AFTER INSERT OR UPDATE OF source OR DELETE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_sources_from_contact();

-- 3. Backfill from existing contacts
INSERT INTO public.crm_sources (name, usage_count)
SELECT btrim(source), COUNT(*)
FROM public.crm_contacts
WHERE source IS NOT NULL AND btrim(source) <> ''
GROUP BY btrim(source)
ON CONFLICT (name_lower) DO UPDATE
  SET usage_count = EXCLUDED.usage_count,
      updated_at = now();