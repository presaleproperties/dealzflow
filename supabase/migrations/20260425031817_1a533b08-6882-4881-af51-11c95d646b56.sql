-- ==========================================================
-- 1. EXTEND crm_sms_log
-- ==========================================================
ALTER TABLE public.crm_sms_log
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS num_segments integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS price_unit text;

-- Allow user_id to be null for inbound messages (no human sender)
ALTER TABLE public.crm_sms_log ALTER COLUMN user_id DROP NOT NULL;

-- Allow contact_id null for inbound from unknown numbers
ALTER TABLE public.crm_sms_log ALTER COLUMN contact_id DROP NOT NULL;

-- Index helpful for replies inbox & campaign analytics
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_direction ON public.crm_sms_log (direction, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_campaign ON public.crm_sms_log (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_scheduled ON public.crm_sms_log (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_crm_sms_log_sid ON public.crm_sms_log (twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;

-- Add policy for service-role inbound inserts (Twilio webhook uses service role)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm_sms_log' AND policyname='Service can insert inbound SMS'
  ) THEN
    CREATE POLICY "Service can insert inbound SMS"
      ON public.crm_sms_log FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm_sms_log' AND policyname='Service can update SMS status'
  ) THEN
    CREATE POLICY "Service can update SMS status"
      ON public.crm_sms_log FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Allow CRM agents+ to update messages they sent (e.g. mark read)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm_sms_log' AND policyname='CRM members can update SMS'
  ) THEN
    CREATE POLICY "CRM members can update SMS"
      ON public.crm_sms_log FOR UPDATE TO authenticated
      USING (is_crm_member(auth.uid())) WITH CHECK (is_crm_member(auth.uid()));
  END IF;
END $$;

-- ==========================================================
-- 2. crm_sms_templates
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  body          text NOT NULL,
  category      text NOT NULL DEFAULT 'general',
  merge_tags    text[] NOT NULL DEFAULT '{}'::text[],
  default_media_urls text[] NOT NULL DEFAULT '{}'::text[],
  is_active     boolean NOT NULL DEFAULT true,
  times_used    integer NOT NULL DEFAULT 0,
  last_used_at  timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view sms templates"
  ON public.crm_sms_templates FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert sms templates"
  ON public.crm_sms_templates FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update sms templates"
  ON public.crm_sms_templates FOR UPDATE TO authenticated
  USING (is_crm_member(auth.uid())) WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete sms templates"
  ON public.crm_sms_templates FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));

CREATE TRIGGER set_sms_templates_updated_at
  BEFORE UPDATE ON public.crm_sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================================
-- 3. crm_sms_campaigns
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  body               text NOT NULL,
  media_urls         text[] NOT NULL DEFAULT '{}'::text[],
  template_id        uuid REFERENCES public.crm_sms_templates(id) ON DELETE SET NULL,
  segment_filter     jsonb,
  recipients_count   integer NOT NULL DEFAULT 0,
  sent_count         integer NOT NULL DEFAULT 0,
  delivered_count    integer NOT NULL DEFAULT 0,
  failed_count       integer NOT NULL DEFAULT 0,
  reply_count        integer NOT NULL DEFAULT 0,
  optout_count       integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'draft', -- draft | scheduled | sending | sent | failed | cancelled
  scheduled_for      timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  throttle_per_min   integer NOT NULL DEFAULT 60,
  from_number        text,
  messaging_service_sid text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view sms campaigns"
  ON public.crm_sms_campaigns FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM agents+ can insert sms campaigns"
  ON public.crm_sms_campaigns FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM agents+ can update sms campaigns"
  ON public.crm_sms_campaigns FOR UPDATE TO authenticated
  USING (is_crm_member(auth.uid())) WITH CHECK (is_crm_agent_or_above(auth.uid()));
CREATE POLICY "CRM admins can delete sms campaigns"
  ON public.crm_sms_campaigns FOR DELETE TO authenticated USING (is_crm_admin(auth.uid()));
CREATE POLICY "Service can update sms campaigns"
  ON public.crm_sms_campaigns FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_sms_campaigns_updated_at
  BEFORE UPDATE ON public.crm_sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_scheduled
  ON public.crm_sms_campaigns (scheduled_for) WHERE status = 'scheduled';

-- Backfill FK from sms_log to campaigns
ALTER TABLE public.crm_sms_log
  DROP CONSTRAINT IF EXISTS crm_sms_log_campaign_id_fkey,
  ADD CONSTRAINT crm_sms_log_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.crm_sms_campaigns(id) ON DELETE SET NULL;

-- ==========================================================
-- 4. crm_sms_campaign_recipients
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_campaign_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.crm_sms_campaigns(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  phone         text NOT NULL,
  status        text NOT NULL DEFAULT 'queued', -- queued | sent | delivered | failed | replied | opted_out
  sms_log_id    uuid REFERENCES public.crm_sms_log(id) ON DELETE SET NULL,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  replied_at    timestamptz,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view campaign recipients"
  ON public.crm_sms_campaign_recipients FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "Service can manage campaign recipients"
  ON public.crm_sms_campaign_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CRM agents+ can insert campaign recipients"
  ON public.crm_sms_campaign_recipients FOR INSERT TO authenticated WITH CHECK (is_crm_agent_or_above(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sms_camp_recipients_campaign
  ON public.crm_sms_campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_camp_recipients_phone
  ON public.crm_sms_campaign_recipients (phone);

-- ==========================================================
-- 5. crm_sms_opt_outs
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_opt_outs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  contact_id    uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  reason        text,
  source        text NOT NULL DEFAULT 'stop_keyword', -- stop_keyword | manual | bounce
  opted_out_at  timestamptz NOT NULL DEFAULT now(),
  re_opted_in_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view opt outs"
  ON public.crm_sms_opt_outs FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can manage opt outs"
  ON public.crm_sms_opt_outs FOR ALL TO authenticated
  USING (is_crm_admin(auth.uid())) WITH CHECK (is_crm_admin(auth.uid()));
CREATE POLICY "Service can manage opt outs"
  ON public.crm_sms_opt_outs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==========================================================
-- 6. crm_sms_numbers (per agent + company fallback)
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_numbers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone         text NOT NULL UNIQUE,
  label         text,
  is_company    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  twilio_sid    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view sms numbers"
  ON public.crm_sms_numbers FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can manage sms numbers"
  ON public.crm_sms_numbers FOR ALL TO authenticated
  USING (is_crm_admin(auth.uid())) WITH CHECK (is_crm_admin(auth.uid()));

CREATE TRIGGER set_sms_numbers_updated_at
  BEFORE UPDATE ON public.crm_sms_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one company default
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_numbers_company
  ON public.crm_sms_numbers ((is_company)) WHERE is_company = true;

-- ==========================================================
-- 7. crm_sms_settings (single row)
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.crm_sms_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  messaging_service_sid    text,
  quiet_hours_start        smallint NOT NULL DEFAULT 21, -- 9pm
  quiet_hours_end          smallint NOT NULL DEFAULT 8,  -- 8am
  quiet_hours_timezone     text NOT NULL DEFAULT 'America/Vancouver',
  enforce_quiet_hours      boolean NOT NULL DEFAULT true,
  optout_footer            text NOT NULL DEFAULT ' Reply STOP to opt out.',
  append_optout_first_msg  boolean NOT NULL DEFAULT true,
  default_throttle_per_min integer NOT NULL DEFAULT 60,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can view sms settings"
  ON public.crm_sms_settings FOR SELECT TO authenticated USING (is_crm_member(auth.uid()));
CREATE POLICY "CRM admins can manage sms settings"
  ON public.crm_sms_settings FOR ALL TO authenticated
  USING (is_crm_admin(auth.uid())) WITH CHECK (is_crm_admin(auth.uid()));

CREATE TRIGGER set_sms_settings_updated_at
  BEFORE UPDATE ON public.crm_sms_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a single settings row
INSERT INTO public.crm_sms_settings (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

-- ==========================================================
-- 8. Helper: check opt-out before sending (function for RPC)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.is_phone_opted_out(_phone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_sms_opt_outs
    WHERE phone = _phone AND re_opted_in_at IS NULL
  );
$$;

-- ==========================================================
-- 9. Realtime — sms_log already covered? add it
-- ==========================================================
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_sms_log';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_sms_log';
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_sms_campaigns';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_sms_campaigns';
  END IF;
END $$;