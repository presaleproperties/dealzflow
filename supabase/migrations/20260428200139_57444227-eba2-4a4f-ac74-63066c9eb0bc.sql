
-- ============================================================
-- 1. EXTEND crm_team for scheduler agent profile
-- ============================================================
ALTER TABLE public.crm_team
  ADD COLUMN IF NOT EXISTS slug                    text,
  ADD COLUMN IF NOT EXISTS headshot_url            text,
  ADD COLUMN IF NOT EXISTS brokerage               text,
  ADD COLUMN IF NOT EXISTS license_no              text,
  ADD COLUMN IF NOT EXISTS timezone                text DEFAULT 'America/Vancouver',
  ADD COLUMN IF NOT EXISTS bio                     text,
  ADD COLUMN IF NOT EXISTS scheduler_onboarded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS default_buffer_min      int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_min_notice_min  int  DEFAULT 240;

CREATE UNIQUE INDEX IF NOT EXISTS crm_team_slug_unique_idx
  ON public.crm_team (lower(slug)) WHERE slug IS NOT NULL;

-- ============================================================
-- 2. EVENT TYPES (per-agent bookable templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_event_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id     uuid NOT NULL,
  slug              text NOT NULL,
  title             text NOT NULL,
  description       text,
  duration_min      int  NOT NULL DEFAULT 30,
  buffer_before_min int  NOT NULL DEFAULT 0,
  buffer_after_min  int  NOT NULL DEFAULT 0,
  min_notice_min    int  NOT NULL DEFAULT 240,
  max_advance_days  int  NOT NULL DEFAULT 60,
  location_type     text NOT NULL DEFAULT 'phone',  -- phone | video | in_person | custom
  location_value    text,                           -- meeting URL, address, instructions
  project_slug      text,                           -- if linked to a presale project
  creates_showing   boolean NOT NULL DEFAULT false,
  requires_payment  boolean NOT NULL DEFAULT false,
  price_cents       int  NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'CAD',
  custom_questions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  color             text DEFAULT '#D7A542',
  is_active         boolean NOT NULL DEFAULT true,
  is_template       boolean NOT NULL DEFAULT false,  -- inactive seed templates
  sort_order        int  NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_user_id, slug)
);

CREATE INDEX IF NOT EXISTS crm_scheduler_event_types_agent_idx
  ON public.crm_scheduler_event_types (agent_user_id, is_active);

ALTER TABLE public.crm_scheduler_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent owns event types"
  ON public.crm_scheduler_event_types
  FOR ALL
  USING (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()))
  WITH CHECK (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()));

CREATE TRIGGER trg_event_types_updated_at
  BEFORE UPDATE ON public.crm_scheduler_event_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. WEEKLY AVAILABILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL,
  day_of_week   int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS crm_scheduler_availability_agent_idx
  ON public.crm_scheduler_availability (agent_user_id, day_of_week);

ALTER TABLE public.crm_scheduler_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent owns availability"
  ON public.crm_scheduler_availability
  FOR ALL
  USING (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()))
  WITH CHECK (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()));

-- ============================================================
-- 4. AVAILABILITY OVERRIDES (vacation, special hours)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_availability_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id  uuid NOT NULL,
  date           date NOT NULL,
  is_unavailable boolean NOT NULL DEFAULT true,  -- true = blocked, false = special hours
  start_time     time,
  end_time       time,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_user_id, date, start_time)
);

ALTER TABLE public.crm_scheduler_availability_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent owns overrides"
  ON public.crm_scheduler_availability_overrides
  FOR ALL
  USING (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()))
  WITH CHECK (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()));

-- ============================================================
-- 5. BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id       uuid NOT NULL,
  event_type_id       uuid NOT NULL REFERENCES public.crm_scheduler_event_types(id) ON DELETE RESTRICT,
  contact_id          uuid,  -- nullable until matched/created
  invitee_first_name  text NOT NULL,
  invitee_last_name   text NOT NULL DEFAULT '(unknown)',
  invitee_email       text,
  invitee_phone       text,
  invitee_timezone    text NOT NULL DEFAULT 'America/Vancouver',
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  duration_min        int NOT NULL,
  status              text NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled | rescheduled | completed | no_show
  cancellation_reason text,
  cancelled_at        timestamptz,
  cancelled_by        text,  -- 'invitee' | 'agent' | 'system'
  rescheduled_from_id uuid REFERENCES public.crm_scheduler_bookings(id) ON DELETE SET NULL,
  location_type       text NOT NULL,
  location_value      text,
  meeting_link        text,
  notes_for_agent     text,
  google_event_id     text,
  google_calendar_id  text,
  payment_required    boolean NOT NULL DEFAULT false,
  payment_status      text DEFAULT 'none',  -- none | pending | paid | refunded
  payment_amount_cents int DEFAULT 0,
  payment_currency    text DEFAULT 'CAD',
  stripe_session_id   text,
  stripe_payment_id   text,
  utm                 jsonb DEFAULT '{}'::jsonb,
  referrer            text,
  ip_address          text,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS crm_scheduler_bookings_agent_start_idx
  ON public.crm_scheduler_bookings (agent_user_id, start_at, status);
CREATE INDEX IF NOT EXISTS crm_scheduler_bookings_contact_idx
  ON public.crm_scheduler_bookings (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_scheduler_bookings_email_idx
  ON public.crm_scheduler_bookings (lower(invitee_email)) WHERE invitee_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_scheduler_bookings_status_idx
  ON public.crm_scheduler_bookings (status, start_at);

ALTER TABLE public.crm_scheduler_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent owns bookings"
  ON public.crm_scheduler_bookings
  FOR ALL
  USING (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()))
  WITH CHECK (auth.uid() = agent_user_id OR public.is_crm_admin(auth.uid()));

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.crm_scheduler_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. BOOKING QUESTIONS (invitee answers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_booking_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES public.crm_scheduler_bookings(id) ON DELETE CASCADE,
  question_key  text NOT NULL,
  question_text text NOT NULL,
  answer        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_scheduler_booking_questions_booking_idx
  ON public.crm_scheduler_booking_questions (booking_id);

ALTER TABLE public.crm_scheduler_booking_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent reads own booking answers"
  ON public.crm_scheduler_booking_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_scheduler_bookings b
      WHERE b.id = booking_id
        AND (b.agent_user_id = auth.uid() OR public.is_crm_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_scheduler_bookings b
      WHERE b.id = booking_id
        AND (b.agent_user_id = auth.uid() OR public.is_crm_admin(auth.uid()))
    )
  );

-- ============================================================
-- 7. REMINDER LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_scheduler_reminder_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.crm_scheduler_bookings(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL,  -- '24h' | '1h' | 'morning_digest'
  channel      text NOT NULL,    -- 'email' | 'sms'
  sent_at      timestamptz NOT NULL DEFAULT now(),
  recipient    text NOT NULL,
  status       text NOT NULL DEFAULT 'sent',
  error        text,
  UNIQUE (booking_id, reminder_kind, channel)
);

ALTER TABLE public.crm_scheduler_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members read reminder log"
  ON public.crm_scheduler_reminder_log
  FOR SELECT
  USING (public.is_crm_member(auth.uid()));

-- ============================================================
-- 8. HELPER: seed defaults for a new scheduler agent
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_scheduler_seed_defaults(_agent_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int;
BEGIN
  -- Default 9-5 weekday availability (Mon-Fri = 1..5)
  FOR d IN 1..5 LOOP
    INSERT INTO public.crm_scheduler_availability (agent_user_id, day_of_week, start_time, end_time)
    VALUES (_agent_user_id, d, '09:00'::time, '17:00'::time)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 5 default event types
  INSERT INTO public.crm_scheduler_event_types
    (agent_user_id, slug, title, description, duration_min, location_type, creates_showing, sort_order, is_template)
  VALUES
    (_agent_user_id, 'discovery-call',     'Discovery Call',         '15-minute intro call to discuss your goals', 15, 'phone',     false, 10, false),
    (_agent_user_id, 'buyer-consultation', 'Buyer Consultation',     '30-minute deep-dive on your home search',     30, 'video',     false, 20, false),
    (_agent_user_id, 'seller-consultation','Seller Consultation',    '45-minute home valuation & strategy meeting', 45, 'in_person', false, 30, false),
    (_agent_user_id, 'project-walkthrough','Project Walkthrough',    '30-minute presale project tour',              30, 'in_person', true,  40, false),
    (_agent_user_id, 'follow-up',          'Follow-up Meeting',      'Quick 20-minute check-in',                    20, 'phone',     false, 50, false)
  ON CONFLICT (agent_user_id, slug) DO NOTHING;
END;
$$;

-- ============================================================
-- 9. TRIGGER: auto-seed when slug is first set on crm_team
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_seed_scheduler_on_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.slug IS NULL OR OLD.slug IS DISTINCT FROM NEW.slug)
     AND NEW.scheduler_onboarded_at IS NULL
     AND NEW.user_id IS NOT NULL
  THEN
    PERFORM public.crm_scheduler_seed_defaults(NEW.user_id);
    NEW.scheduler_onboarded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_team_seed_scheduler ON public.crm_team;
CREATE TRIGGER trg_crm_team_seed_scheduler
  BEFORE INSERT OR UPDATE OF slug ON public.crm_team
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_scheduler_on_slug();

-- ============================================================
-- 10. PUBLIC SLUG RESOLVER (used by edge function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_scheduler_resolve_slug(_team_slug text, _event_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'user_id',     t.user_id,
      'slug',        t.slug,
      'display_name',t.display_name,
      'email',       t.email,
      'headshot_url',t.headshot_url,
      'brokerage',   t.brokerage,
      'license_no',  t.license_no,
      'timezone',    COALESCE(t.timezone, 'America/Vancouver'),
      'bio',         t.bio
    ),
    'event_type', to_jsonb(et.*) - 'agent_user_id'
  )
  INTO v_result
  FROM public.crm_team t
  JOIN public.crm_scheduler_event_types et ON et.agent_user_id = t.user_id
  WHERE lower(t.slug) = lower(_team_slug)
    AND lower(et.slug) = lower(_event_slug)
    AND t.is_active = true
    AND et.is_active = true
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 11. ADD 'scheduler' SOURCE TO REGISTRY
-- ============================================================
INSERT INTO public.crm_lead_sources (slug, display_name, source_type, description, is_active, default_lead_type, default_status)
VALUES ('scheduler', 'DealzFlow Scheduler', 'webhook', 'Bookings made through the native scheduler', true, 'buyer', 'New Lead')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 12. AUTO-SLUG SEED for existing crm_team rows from email prefix
-- ============================================================
UPDATE public.crm_team
   SET slug = lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9]+', '-', 'g'))
 WHERE slug IS NULL
   AND email IS NOT NULL
   AND user_id IS NOT NULL;
