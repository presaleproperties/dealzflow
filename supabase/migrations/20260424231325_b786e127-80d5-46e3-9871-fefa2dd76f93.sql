-- ============================================================
-- CENTRAL HUB FOUNDATION
-- ============================================================

-- 1. Lead sources registry
CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'webhook', -- webhook | api | manual | form | ads | calendar
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_tags TEXT[] DEFAULT '{}',
  default_assigned_to TEXT, -- display name of CRM team member
  default_lead_type TEXT,
  default_status TEXT DEFAULT 'New Lead',
  webhook_url TEXT, -- public webhook URL if applicable
  config JSONB DEFAULT '{}'::jsonb, -- source-specific config (channel ids, form ids, etc.)
  total_leads_ingested INTEGER NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view lead sources"
  ON public.crm_lead_sources FOR SELECT TO authenticated
  USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM admins can insert lead sources"
  ON public.crm_lead_sources FOR INSERT TO authenticated
  WITH CHECK (public.is_crm_admin(auth.uid()));

CREATE POLICY "CRM admins can update lead sources"
  ON public.crm_lead_sources FOR UPDATE TO authenticated
  USING (public.is_crm_admin(auth.uid()));

CREATE POLICY "CRM admins can delete lead sources"
  ON public.crm_lead_sources FOR DELETE TO authenticated
  USING (public.is_crm_admin(auth.uid()));

CREATE TRIGGER trg_crm_lead_sources_updated_at
  BEFORE UPDATE ON public.crm_lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Raw inbound event log
CREATE TABLE IF NOT EXISTS public.crm_source_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug TEXT NOT NULL,
  source_id UUID REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'lead_ingest',
  external_id TEXT,
  email TEXT,
  phone TEXT,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received', -- received | processed | failed | skipped
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_events_source_slug ON public.crm_source_events(source_slug);
CREATE INDEX idx_source_events_email ON public.crm_source_events(email);
CREATE INDEX idx_source_events_contact ON public.crm_source_events(contact_id);
CREATE INDEX idx_source_events_status ON public.crm_source_events(status);
CREATE INDEX idx_source_events_occurred_at ON public.crm_source_events(occurred_at DESC);

ALTER TABLE public.crm_source_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM admins can view source events"
  ON public.crm_source_events FOR SELECT TO authenticated
  USING (public.is_crm_admin(auth.uid()));

-- (Inserts are done by edge functions using service role; no insert policy needed)

-- 3. Seed initial sources
INSERT INTO public.crm_lead_sources (slug, display_name, source_type, description, default_lead_type, config) VALUES
  ('presale_properties', 'Presale Properties Website', 'webhook', 'Signups & behavior from presaleproperties.com', 'Pre-Sale', '{"bridge_function": "bridge-ingest-lead"}'::jsonb),
  ('manual', 'Manual Entry', 'manual', 'Leads added directly in the CRM UI', NULL, '{}'::jsonb),
  ('calendly', 'Calendly', 'webhook', 'Meeting bookings from Calendly', NULL, '{}'::jsonb),
  ('facebook_ads', 'Facebook Lead Ads', 'ads', 'Leads from Meta Lead Ads forms', NULL, '{}'::jsonb),
  ('google_ads', 'Google Ads', 'ads', 'Leads from Google Ads forms', NULL, '{}'::jsonb),
  ('lofty', 'Lofty CRM', 'api', 'Inbound leads synced from Lofty', NULL, '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 4. Refactor crm_recipients_for_contact: route ONLY to assigned owner (fallback: owner role)
CREATE OR REPLACE FUNCTION public.crm_recipients_for_contact(_assigned_to text)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    -- Assigned: route only to that team member
    WHEN _assigned_to IS NOT NULL AND _assigned_to <> '' THEN
      COALESCE(
        (SELECT array_agg(user_id) FROM public.crm_team
          WHERE is_active = true AND lower(display_name) = lower(_assigned_to)),
        -- Fallback to owner role if name doesn't match
        (SELECT array_agg(user_id) FROM public.crm_team
          WHERE is_active = true AND role = 'owner')
      )
    -- Unassigned: route to owner only
    ELSE
      (SELECT array_agg(user_id) FROM public.crm_team
        WHERE is_active = true AND role = 'owner')
  END;
$$;

-- 5. Update return-visit notification trigger to also respect assignment
CREATE OR REPLACE FUNCTION public.trg_behavior_session_return_notify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prev_at TIMESTAMPTZ;
  v_gap_minutes INTEGER;
  v_first_name TEXT;
  v_last_name TEXT;
  v_assigned_to TEXT;
  v_full_name TEXT;
  v_landing TEXT;
  v_body TEXT;
  v_link TEXT;
  v_recipients UUID[];
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(ended_at, started_at) INTO v_prev_at
  FROM public.crm_lead_behavior_sessions
  WHERE contact_id = NEW.contact_id AND id <> NEW.id
  ORDER BY started_at DESC LIMIT 1;

  IF v_prev_at IS NULL THEN RETURN NEW; END IF;

  v_gap_minutes := EXTRACT(EPOCH FROM (NEW.started_at - v_prev_at)) / 60;
  IF v_gap_minutes < 30 THEN RETURN NEW; END IF;

  SELECT first_name, last_name, assigned_to INTO v_first_name, v_last_name, v_assigned_to
  FROM public.crm_contacts WHERE id = NEW.contact_id;

  v_full_name := NULLIF(TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, '')), '');
  IF v_full_name IS NULL THEN v_full_name := 'A lead'; END IF;

  v_landing := COALESCE(NEW.landing_page, NEW.exit_page, 'the site');
  v_link := '/crm/leads/' || NEW.contact_id::text;

  v_body := v_full_name || ' is back on presaleproperties.com — viewing ' || v_landing
            || ' (last visit ' ||
            CASE
              WHEN v_gap_minutes < 60 THEN v_gap_minutes::text || 'm ago'
              WHEN v_gap_minutes < 1440 THEN ROUND(v_gap_minutes / 60.0, 1)::text || 'h ago'
              ELSE ROUND(v_gap_minutes / 1440.0, 1)::text || 'd ago'
            END || ')';

  v_recipients := public.crm_recipients_for_contact(v_assigned_to);
  PERFORM public.notify_crm(v_recipients, v_full_name || ' returned to the site', v_body, 'lead_return_visit', v_link);

  RETURN NEW;
END;
$$;

-- 6. Helper: log a source event (called by edge functions via service role)
CREATE OR REPLACE FUNCTION public.log_source_event(
  _source_slug TEXT,
  _event_type TEXT,
  _email TEXT,
  _phone TEXT,
  _external_id TEXT,
  _payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_source_id UUID;
BEGIN
  SELECT id INTO v_source_id FROM public.crm_lead_sources WHERE slug = _source_slug;

  INSERT INTO public.crm_source_events
    (source_slug, source_id, event_type, email, phone, external_id, raw_payload, status)
  VALUES
    (_source_slug, v_source_id, COALESCE(_event_type, 'lead_ingest'),
     lower(NULLIF(TRIM(_email), '')), NULLIF(_phone, ''), _external_id, COALESCE(_payload, '{}'::jsonb), 'received')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 7. Helper: mark event processed
CREATE OR REPLACE FUNCTION public.mark_source_event_processed(
  _event_id UUID,
  _contact_id UUID,
  _status TEXT DEFAULT 'processed',
  _error TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
BEGIN
  UPDATE public.crm_source_events
     SET contact_id = _contact_id,
         status = _status,
         error_message = _error,
         processed_at = now()
   WHERE id = _event_id
   RETURNING source_slug INTO v_slug;

  IF v_slug IS NOT NULL AND _status = 'processed' THEN
    UPDATE public.crm_lead_sources
       SET total_leads_ingested = total_leads_ingested + 1,
           last_event_at = now(),
           updated_at = now()
     WHERE slug = v_slug;
  ELSIF v_slug IS NOT NULL AND _status = 'failed' THEN
    UPDATE public.crm_lead_sources
       SET last_error = _error,
           last_error_at = now(),
           updated_at = now()
     WHERE slug = v_slug;
  END IF;
END;
$$;