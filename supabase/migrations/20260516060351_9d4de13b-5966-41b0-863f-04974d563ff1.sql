-- ============================================================
-- system_settings: singleton key/value for global app toggles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members can read system_settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (is_crm_member(auth.uid()));

CREATE POLICY "CRM admins can manage system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (is_crm_admin(auth.uid()))
  WITH CHECK (is_crm_admin(auth.uid()));

-- Touch updated_at on any change
CREATE OR REPLACE FUNCTION public.touch_system_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_system_settings ON public.system_settings;
CREATE TRIGGER trg_touch_system_settings
  BEFORE INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_system_settings();

-- Seed the kill switch ON (post-43k-bill default)
INSERT INTO public.system_settings (key, value)
VALUES ('sms_kill_switch', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value)
VALUES ('sms_daily_cap', '500'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- sms_outbound_queue: staged SMS awaiting admin approval
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sms_outbound_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  to_number text NOT NULL,
  from_number text,
  body text NOT NULL,
  media_urls text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','approved','rejected','sent','failed','expired')),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  scheduled_for timestamptz,
  template_id uuid,
  campaign_id uuid,
  reason text,                     -- why it got staged ('kill_switch' | 'daily_cap' | 'quiet_hours')
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_outbound_queue_status
  ON public.sms_outbound_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_outbound_queue_requested_by
  ON public.sms_outbound_queue (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_outbound_queue_contact
  ON public.sms_outbound_queue (contact_id);

ALTER TABLE public.sms_outbound_queue ENABLE ROW LEVEL SECURITY;

-- Agents see their own staged rows + rows for contacts they can see
CREATE POLICY "Queue: agents see own + visible contacts"
  ON public.sms_outbound_queue FOR SELECT
  TO authenticated
  USING (
    is_crm_admin(auth.uid())
    OR requested_by = auth.uid()
    OR (contact_id IS NOT NULL AND crm_can_see_contact_id(auth.uid(), contact_id))
  );

-- Agents may insert their own staged sends
CREATE POLICY "Queue: agents insert own"
  ON public.sms_outbound_queue FOR INSERT
  TO authenticated
  WITH CHECK (is_crm_agent_or_above(auth.uid()) AND requested_by = auth.uid());

-- Only admins approve / reject / mark sent
CREATE POLICY "Queue: admins update"
  ON public.sms_outbound_queue FOR UPDATE
  TO authenticated
  USING (is_crm_admin(auth.uid()))
  WITH CHECK (is_crm_admin(auth.uid()));

-- Only admins delete
CREATE POLICY "Queue: admins delete"
  ON public.sms_outbound_queue FOR DELETE
  TO authenticated
  USING (is_crm_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_sms_outbound_queue_updated_at ON public.sms_outbound_queue;
CREATE TRIGGER trg_sms_outbound_queue_updated_at
  BEFORE UPDATE ON public.sms_outbound_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();