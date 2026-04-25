-- 1. Realtime
ALTER TABLE public.crm_lead_behavior_views REPLICA IDENTITY FULL;
ALTER TABLE public.crm_lead_behavior_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.crm_lead_behavior_forms REPLICA IDENTITY FULL;
ALTER TABLE public.crm_lead_behavior_engagement REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_lead_behavior_views') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_behavior_views;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_lead_behavior_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_behavior_sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_lead_behavior_forms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_behavior_forms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_lead_behavior_engagement') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_behavior_engagement;
  END IF;
END $$;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_lbv_contact_viewed ON public.crm_lead_behavior_views (contact_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbv_psu ON public.crm_lead_behavior_views (presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lbs_contact_started ON public.crm_lead_behavior_sessions (contact_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbs_psu ON public.crm_lead_behavior_sessions (presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lbf_contact_submitted ON public.crm_lead_behavior_forms (contact_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbf_psu ON public.crm_lead_behavior_forms (presale_user_id) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lbe_contact_occurred ON public.crm_lead_behavior_engagement (contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lbe_psu ON public.crm_lead_behavior_engagement (presale_user_id) WHERE contact_id IS NULL;

-- 3. Cross-lead overview RPC
CREATE OR REPLACE FUNCTION public.crm_behavior_overview(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - (_days || ' days')::interval;
  v_top_props jsonb;
  v_active_sessions int;
  v_funnel jsonb;
  v_return_visits int;
  v_total_events int;
BEGIN
  IF NOT public.is_crm_member(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_props
  FROM (
    SELECT property_name, property_url, COUNT(*) AS views, COUNT(DISTINCT contact_id) FILTER (WHERE contact_id IS NOT NULL) AS unique_leads
    FROM crm_lead_behavior_views
    WHERE viewed_at >= v_since AND property_name IS NOT NULL
    GROUP BY property_name, property_url
    ORDER BY views DESC
    LIMIT 10
  ) t;

  SELECT COUNT(*) INTO v_active_sessions
  FROM crm_lead_behavior_sessions
  WHERE started_at >= now() - interval '30 minutes';

  SELECT jsonb_build_object(
    'started', COUNT(*) FILTER (WHERE form_type IN ('signup_started','signup_step_1')),
    'in_progress', COUNT(*) FILTER (WHERE form_type IN ('signup_step_2','signup_step_3')),
    'completed', COUNT(*) FILTER (WHERE form_type = 'signup_completed'),
    'abandoned', COUNT(*) FILTER (WHERE form_type = 'signup_abandoned')
  ) INTO v_funnel
  FROM crm_lead_behavior_forms WHERE submitted_at >= v_since;

  SELECT COUNT(*) INTO v_return_visits
  FROM (
    SELECT contact_id, COUNT(*) AS sess
    FROM crm_lead_behavior_sessions
    WHERE started_at >= v_since AND contact_id IS NOT NULL
    GROUP BY contact_id HAVING COUNT(*) >= 2
  ) r;

  SELECT
    (SELECT COUNT(*) FROM crm_lead_behavior_views WHERE viewed_at >= v_since)
  + (SELECT COUNT(*) FROM crm_lead_behavior_sessions WHERE started_at >= v_since)
  + (SELECT COUNT(*) FROM crm_lead_behavior_forms WHERE submitted_at >= v_since)
  + (SELECT COUNT(*) FROM crm_lead_behavior_engagement WHERE occurred_at >= v_since)
  INTO v_total_events;

  RETURN jsonb_build_object(
    'window_days', _days,
    'total_events', v_total_events,
    'active_sessions_30m', v_active_sessions,
    'return_visits', v_return_visits,
    'signup_funnel', v_funnel,
    'top_properties', v_top_props
  );
END;
$$;

-- 4. Notify on signup_completed
CREATE OR REPLACE FUNCTION public.trg_notify_signup_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text; v_last text; v_assigned text; v_recipients uuid[]; v_full text;
BEGIN
  IF NEW.form_type <> 'signup_completed' OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT first_name, last_name, assigned_to INTO v_first, v_last, v_assigned
  FROM public.crm_contacts WHERE id = NEW.contact_id;
  v_full := NULLIF(TRIM(COALESCE(v_first,'') || ' ' || COALESCE(v_last,'')), '');
  IF v_full IS NULL THEN v_full := 'A lead'; END IF;
  v_recipients := public.crm_recipients_for_contact(v_assigned);
  PERFORM public.notify_crm(
    v_recipients,
    '✅ ' || v_full || ' completed signup',
    COALESCE('Property: ' || NEW.property_name, 'Signup completed on Presale Properties'),
    'signup_completed',
    '/crm/leads/' || NEW.contact_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_signup_completed_t ON public.crm_lead_behavior_forms;
CREATE TRIGGER trg_notify_signup_completed_t
AFTER INSERT ON public.crm_lead_behavior_forms
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_signup_completed();