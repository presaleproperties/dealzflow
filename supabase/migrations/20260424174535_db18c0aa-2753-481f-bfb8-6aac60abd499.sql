-- Behavior tracking tables (data pushed from Presale Properties via bridge)

CREATE TABLE public.crm_lead_behavior_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  presale_user_id TEXT,
  email TEXT,
  property_id TEXT,
  property_name TEXT,
  property_url TEXT,
  action TEXT NOT NULL DEFAULT 'view', -- view | favorite | unfavorite
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_behavior_views_contact ON public.crm_lead_behavior_views(contact_id);
CREATE INDEX idx_behavior_views_email ON public.crm_lead_behavior_views(email);

CREATE TABLE public.crm_lead_behavior_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  email TEXT,
  event_type TEXT NOT NULL, -- email_open | email_click | email_unsubscribe | email_bounce
  campaign_id TEXT,
  campaign_name TEXT,
  link_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_behavior_engagement_contact ON public.crm_lead_behavior_engagement(contact_id);

CREATE TABLE public.crm_lead_behavior_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  email TEXT,
  form_type TEXT NOT NULL, -- contact | brochure_download | floor_plan | tour_request | newsletter
  form_name TEXT,
  property_id TEXT,
  property_name TEXT,
  payload JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_behavior_forms_contact ON public.crm_lead_behavior_forms(contact_id);

CREATE TABLE public.crm_lead_behavior_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  email TEXT,
  session_id TEXT,
  pages_viewed INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_behavior_sessions_contact ON public.crm_lead_behavior_sessions(contact_id);

-- Template sync metadata: track origin & last sync to prevent loops
ALTER TABLE public.crm_email_templates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm', -- 'crm' | 'presale'
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_external_id ON public.crm_email_templates(external_id) WHERE external_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.crm_lead_behavior_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_behavior_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_behavior_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_behavior_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: CRM members can view; only service role inserts (via bridge)
CREATE POLICY "CRM members view behavior views" ON public.crm_lead_behavior_views FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM members view engagement" ON public.crm_lead_behavior_engagement FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM members view forms" ON public.crm_lead_behavior_forms FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM members view sessions" ON public.crm_lead_behavior_sessions FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));

-- Trigger to bump last_touch on behavior events
CREATE OR REPLACE FUNCTION public.update_last_touch_on_behavior()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.crm_contacts
    SET last_touch_at = COALESCE(NEW.viewed_at, NEW.occurred_at, NEW.submitted_at, NEW.started_at, now()),
        last_touch_type = TG_ARGV[0]
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_behavior_view_touch AFTER INSERT ON public.crm_lead_behavior_views FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_behavior('property_view');
CREATE TRIGGER trg_behavior_engagement_touch AFTER INSERT ON public.crm_lead_behavior_engagement FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_behavior('email_engagement');
CREATE TRIGGER trg_behavior_form_touch AFTER INSERT ON public.crm_lead_behavior_forms FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_behavior('form_submission');
CREATE TRIGGER trg_behavior_session_touch AFTER INSERT ON public.crm_lead_behavior_sessions FOR EACH ROW EXECUTE FUNCTION public.update_last_touch_on_behavior('site_visit');