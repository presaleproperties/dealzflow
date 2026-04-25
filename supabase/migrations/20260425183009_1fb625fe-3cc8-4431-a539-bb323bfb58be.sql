
CREATE OR REPLACE FUNCTION public._touch_skip_enabled()
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN COALESCE(current_setting('app.skip_touch', true), 'off') = 'on';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stage_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.stage_changed_at = NOW();
    IF NOT public._touch_skip_enabled() THEN
      NEW.last_touch_at = NOW();
      NEW.last_touch_type = 'stage_change';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_touch_on_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._touch_skip_enabled() THEN RETURN NEW; END IF;
  UPDATE public.crm_contacts
    SET last_touch_at = NEW.sent_at, last_touch_type = 'email_sent'
    WHERE id = NEW.contact_id
      AND (last_touch_at IS NULL OR NEW.sent_at > last_touch_at);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_touch_on_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._touch_skip_enabled() THEN RETURN NEW; END IF;
  UPDATE public.crm_contacts
    SET last_touch_at = NOW(), last_touch_type = 'note_added'
    WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_touch_on_sms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public._touch_skip_enabled() THEN RETURN NEW; END IF;
  UPDATE public.crm_contacts
    SET last_touch_at = NEW.sent_at, last_touch_type = 'sms_sent'
    WHERE id = NEW.contact_id
      AND (last_touch_at IS NULL OR NEW.sent_at > last_touch_at);
  RETURN NEW;
END;
$$;

-- ===== Repair leads bumped by today's bulk pipeline cleanup =====
DO $repair$
DECLARE
  bad_ts CONSTANT timestamptz := '2026-04-25 18:24:03.697193+00';
BEGIN
  PERFORM set_config('app.skip_touch', 'on', true);

  WITH affected AS (
    SELECT id FROM public.crm_contacts
    WHERE last_touch_at = bad_ts AND last_touch_type = 'stage_change'
  ),
  real_activity AS (
    SELECT contact_id, MAX(ts) AS ts,
           (ARRAY_AGG(touch_type ORDER BY ts DESC))[1] AS touch_type
    FROM (
      SELECT contact_id, sent_at AS ts, 'email_sent'::text AS touch_type
        FROM public.crm_email_log
        WHERE contact_id IN (SELECT id FROM affected) AND sent_at IS NOT NULL
      UNION ALL
      SELECT contact_id, created_at AS ts, 'note_added'::text
        FROM public.crm_notes
        WHERE contact_id IN (SELECT id FROM affected)
      UNION ALL
      SELECT contact_id, sent_at AS ts, 'sms_sent'::text
        FROM public.crm_sms_log
        WHERE contact_id IN (SELECT id FROM affected) AND sent_at IS NOT NULL
      UNION ALL
      SELECT contact_id,
             (showing_date::timestamp + COALESCE(showing_time, '00:00'::time))::timestamptz AS ts,
             'showing_booked'::text
        FROM public.crm_showings
        WHERE contact_id IN (SELECT id FROM affected) AND showing_date IS NOT NULL
      UNION ALL
      SELECT contact_id, viewed_at AS ts, 'property_view'::text
        FROM public.crm_lead_behavior_views
        WHERE contact_id IN (SELECT id FROM affected) AND viewed_at IS NOT NULL
      UNION ALL
      SELECT contact_id, occurred_at AS ts, 'email_engagement'::text
        FROM public.crm_lead_behavior_engagement
        WHERE contact_id IN (SELECT id FROM affected) AND occurred_at IS NOT NULL
      UNION ALL
      SELECT contact_id, submitted_at AS ts, 'form_submission'::text
        FROM public.crm_lead_behavior_forms
        WHERE contact_id IN (SELECT id FROM affected) AND submitted_at IS NOT NULL
      UNION ALL
      SELECT contact_id, started_at AS ts, 'site_visit'::text
        FROM public.crm_lead_behavior_sessions
        WHERE contact_id IN (SELECT id FROM affected) AND started_at IS NOT NULL
    ) all_acts
    WHERE ts IS NOT NULL
    GROUP BY contact_id
  )
  UPDATE public.crm_contacts c
     SET last_touch_at  = ra.ts,
         last_touch_type = ra.touch_type
    FROM real_activity ra
   WHERE c.id = ra.contact_id;

  -- No real activity → null out so UI shows "no activity" honestly.
  UPDATE public.crm_contacts
     SET last_touch_at = NULL, last_touch_type = NULL
   WHERE last_touch_at = bad_ts AND last_touch_type = 'stage_change';
END
$repair$;
