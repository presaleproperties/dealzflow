
CREATE OR REPLACE FUNCTION public.crm_stitch_orphan_behavior()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backfilled int := 0;
  v_forms int := 0;
  v_views int := 0;
  v_sessions int := 0;
  v_engagement int := 0;
BEGIN
  -- Forms
  WITH upd AS (
    UPDATE crm_lead_behavior_forms b
    SET contact_id = c.id, email = COALESCE(b.email, c.email)
    FROM crm_contacts c
    WHERE b.contact_id IS NULL
      AND (
        (b.presale_user_id IS NOT NULL AND b.presale_user_id = c.presale_user_id)
        OR (b.email IS NOT NULL AND lower(b.email) = lower(c.email))
      )
    RETURNING 1
  ) SELECT count(*) INTO v_forms FROM upd;

  -- Views
  WITH upd AS (
    UPDATE crm_lead_behavior_views b
    SET contact_id = c.id, email = COALESCE(b.email, c.email)
    FROM crm_contacts c
    WHERE b.contact_id IS NULL
      AND (
        (b.presale_user_id IS NOT NULL AND b.presale_user_id = c.presale_user_id)
        OR (b.email IS NOT NULL AND lower(b.email) = lower(c.email))
      )
    RETURNING 1
  ) SELECT count(*) INTO v_views FROM upd;

  -- Sessions
  WITH upd AS (
    UPDATE crm_lead_behavior_sessions b
    SET contact_id = c.id, email = COALESCE(b.email, c.email)
    FROM crm_contacts c
    WHERE b.contact_id IS NULL
      AND (
        (b.presale_user_id IS NOT NULL AND b.presale_user_id = c.presale_user_id)
        OR (b.email IS NOT NULL AND lower(b.email) = lower(c.email))
      )
    RETURNING 1
  ) SELECT count(*) INTO v_sessions FROM upd;

  -- Engagement
  WITH upd AS (
    UPDATE crm_lead_behavior_engagement b
    SET contact_id = c.id, email = COALESCE(b.email, c.email)
    FROM crm_contacts c
    WHERE b.contact_id IS NULL
      AND (
        (b.presale_user_id IS NOT NULL AND b.presale_user_id = c.presale_user_id)
        OR (b.email IS NOT NULL AND lower(b.email) = lower(c.email))
      )
    RETURNING 1
  ) SELECT count(*) INTO v_engagement FROM upd;

  -- Backfill presale_user_id on contacts using behavior rows that match by email
  WITH src AS (
    SELECT email, presale_user_id FROM (
      SELECT DISTINCT ON (lower(email)) lower(email) AS email, presale_user_id
      FROM crm_lead_behavior_views
      WHERE email IS NOT NULL AND presale_user_id IS NOT NULL
      UNION ALL
      SELECT DISTINCT ON (lower(email)) lower(email) AS email, presale_user_id
      FROM crm_lead_behavior_forms
      WHERE email IS NOT NULL AND presale_user_id IS NOT NULL
    ) x
  ),
  upd AS (
    UPDATE crm_contacts c
    SET presale_user_id = s.presale_user_id
    FROM src s
    WHERE c.presale_user_id IS NULL
      AND lower(c.email) = s.email
    RETURNING 1
  ) SELECT count(*) INTO v_backfilled FROM upd;

  RETURN jsonb_build_object(
    'stitched', jsonb_build_object(
      'forms', v_forms, 'views', v_views,
      'sessions', v_sessions, 'engagement', v_engagement
    ),
    'contacts_backfilled', v_backfilled,
    'ran_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_stitch_orphan_behavior() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_stitch_orphan_behavior() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('crm-stitch-orphan-behavior');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crm-stitch-orphan-behavior',
  '*/15 * * * *',
  $cron$ SELECT public.crm_stitch_orphan_behavior(); $cron$
);

-- Run once now to clear current backlog
SELECT public.crm_stitch_orphan_behavior();
