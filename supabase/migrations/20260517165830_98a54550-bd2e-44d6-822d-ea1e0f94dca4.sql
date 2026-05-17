-- Tier 1: Zara Draft & Suggest schema

-- 1. zara_settings (singleton)
CREATE TABLE IF NOT EXISTS public.zara_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('off','sandbox','live')),
  test_phone_numbers text[] NOT NULL DEFAULT '{}'::text[],
  enabled_at timestamptz,
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.zara_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. zara_suggested_replies
CREATE TABLE IF NOT EXISTS public.zara_suggested_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  inbound_event_id uuid REFERENCES public.crm_engagement_events(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  inbound_text text NOT NULL,
  inbound_at timestamptz NOT NULL,
  draft_text text NOT NULL,
  draft_subject text,
  draft_language text,
  intent text,
  confidence numeric(3,2),
  reasoning text,
  guardrails_hit text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','edited_approved','rejected','snoozed','expired','sent','sandbox_blocked')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approval_method text,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  model text NOT NULL DEFAULT 'claude-haiku-4-5',
  input_tokens int,
  output_tokens int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_drafts_status_created ON public.zara_suggested_replies (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_drafts_contact_created ON public.zara_suggested_replies (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_drafts_assigned_pending ON public.zara_suggested_replies (assigned_to, status) WHERE status = 'pending';

-- 3. zara_approval_decisions
CREATE TABLE IF NOT EXISTS public.zara_approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.zara_suggested_replies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approve','edit_approve','reject','snooze')),
  original_text text NOT NULL,
  final_text text,
  edit_distance int,
  reject_reason text,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_via text NOT NULL CHECK (decided_via IN ('whatsapp_thumbs','crm_button','auto_expire')),
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zara_decisions_draft ON public.zara_approval_decisions (draft_id);
CREATE INDEX IF NOT EXISTS idx_zara_decisions_contact_decided ON public.zara_approval_decisions (contact_id, decided_at DESC);

-- 4. zara_lead_memory
CREATE TABLE IF NOT EXISTS public.zara_lead_memory (
  contact_id uuid PRIMARY KEY REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  summary text NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  refresh_reason text
);
CREATE INDEX IF NOT EXISTS idx_zara_memory_refreshed ON public.zara_lead_memory (refreshed_at);

-- 5. zara_whatsapp_message_map
CREATE TABLE IF NOT EXISTS public.zara_whatsapp_message_map (
  whatsapp_message_id text PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES public.zara_suggested_replies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. crm_contacts opt-in columns
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS zara_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zara_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS zara_enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_zara_enabled ON public.crm_contacts (zara_enabled) WHERE zara_enabled = true;

-- 7. RLS
ALTER TABLE public.zara_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_suggested_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_lead_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zara_whatsapp_message_map ENABLE ROW LEVEL SECURITY;

-- Read: authenticated users
CREATE POLICY "zara_settings_read" ON public.zara_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "zara_drafts_read" ON public.zara_suggested_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "zara_decisions_read" ON public.zara_approval_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "zara_memory_read" ON public.zara_lead_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "zara_map_read" ON public.zara_whatsapp_message_map FOR SELECT TO authenticated USING (true);

-- Update: authenticated (drafts & settings)
CREATE POLICY "zara_drafts_update" ON public.zara_suggested_replies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "zara_settings_update" ON public.zara_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Inserts/deletes: service_role only (no policies for authenticated; RLS blocks by default)

-- 8. updated_at trigger for zara_settings
CREATE OR REPLACE FUNCTION public.zara_settings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_zara_settings_updated_at ON public.zara_settings;
CREATE TRIGGER trg_zara_settings_updated_at
  BEFORE UPDATE ON public.zara_settings
  FOR EACH ROW EXECUTE FUNCTION public.zara_settings_touch_updated_at();