-- 1. Index for sort/filter by Last Activity
CREATE INDEX IF NOT EXISTS idx_crm_contacts_last_touch_at
  ON public.crm_contacts (last_touch_at DESC NULLS LAST);

-- 2. Backfill last_touch_at from real activity on every lead
WITH activity AS (
  SELECT
    c.id AS contact_id,
    GREATEST(
      COALESCE((SELECT MAX(COALESCE(event_at, created_at))
                FROM public.crm_notes
                WHERE contact_id = c.id
                  AND COALESCE(note_type, '') NOT IN ('import_archive')), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(sent_at) FROM public.crm_email_log    WHERE contact_id = c.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(sent_at) FROM public.crm_sms_log      WHERE contact_id = c.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM public.crm_messages  WHERE contact_id = c.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(COALESCE(created_at, (showing_date::timestamp)::timestamptz))
                FROM public.crm_showings WHERE contact_id = c.id), 'epoch'::timestamptz)
    ) AS computed_touch
  FROM public.crm_contacts c
)
UPDATE public.crm_contacts c
SET last_touch_at = NULLIF(a.computed_touch, 'epoch'::timestamptz)
FROM activity a
WHERE a.contact_id = c.id;

-- 3. Add 2 missing pipeline segments (Contacted, Hot 🔥) — covers the 848 leads with no chip
INSERT INTO public.crm_lead_segments (name, filter_config, sort_order, is_default)
VALUES
  ('Contacted', '{"status": ["Contacted"]}'::jsonb, 25, false),
  ('Hot 🔥',    '{"status": ["Hot / Engaged"]}'::jsonb, 35, false)
ON CONFLICT DO NOTHING;

-- 4. Fix existing segment filters so Pre-Sale / Re-Sale / Commercial light up.
--    The data has tags like 'presale' and lead_type values like 'Pre-Sale' — we OR them together
--    via a new filter shape: { tags_any_ci: [...], lead_type_ci: [...] } which the matcher will
--    interpret as case-insensitive OR across both fields.
UPDATE public.crm_lead_segments
   SET filter_config = '{"tags_any_ci": ["presale", "pre-sale"], "lead_type_ci": ["pre-sale", "presale"]}'::jsonb
 WHERE name = 'Pre-Sale 🔥';

UPDATE public.crm_lead_segments
   SET filter_config = '{"tags_any_ci": ["resale", "re-sale"], "lead_type_ci": ["re-sale", "resale", "first-time buyer", "investor", "both"]}'::jsonb
 WHERE name = 'Re-Sale 🔥';

UPDATE public.crm_lead_segments
   SET filter_config = '{"tags_any_ci": ["commercial"], "lead_type_ci": ["commercial"]}'::jsonb
 WHERE name = 'Commercial';