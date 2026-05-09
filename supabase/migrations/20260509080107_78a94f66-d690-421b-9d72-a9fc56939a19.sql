-- =====================================================================
-- In-app Dialer (Twilio Voice WebRTC) — V1 schema
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number text,
  to_number text,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  recording_url text,
  recording_duration_sec integer,
  recording_sid text,
  twilio_call_sid text UNIQUE,
  parent_call_sid text,
  error_code text,
  error_message text,
  voicemail_dropped_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_call_log_contact ON public.crm_call_log(contact_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_call_log_agent   ON public.crm_call_log(agent_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_call_log_sid     ON public.crm_call_log(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_crm_call_log_started ON public.crm_call_log(started_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_voicemail_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_scope text NOT NULL DEFAULT 'agent' CHECK (owner_scope IN ('agent','team')),
  owner_agent_slug text,
  name text NOT NULL,
  audio_url text NOT NULL,
  audio_path text NOT NULL,
  duration_sec integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_voicemail_drops_owner ON public.crm_voicemail_drops(owner_user_id, is_active);

ALTER TABLE public.crm_call_log
  DROP CONSTRAINT IF EXISTS crm_call_log_voicemail_dropped_fk;
ALTER TABLE public.crm_call_log
  ADD CONSTRAINT crm_call_log_voicemail_dropped_fk
  FOREIGN KEY (voicemail_dropped_id) REFERENCES public.crm_voicemail_drops(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_crm_call_log_updated_at ON public.crm_call_log;
CREATE TRIGGER trg_crm_call_log_updated_at
  BEFORE UPDATE ON public.crm_call_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_crm_voicemail_drops_updated_at ON public.crm_voicemail_drops;
CREATE TRIGGER trg_crm_voicemail_drops_updated_at
  BEFORE UPDATE ON public.crm_voicemail_drops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crm_call_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_voicemail_drops  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Call log visible to assigned + admins" ON public.crm_call_log;
CREATE POLICY "Call log visible to assigned + admins"
ON public.crm_call_log FOR SELECT TO authenticated
USING (
  (contact_id IS NULL
    AND EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.is_active))
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

DROP POLICY IF EXISTS "Team can insert own call rows" ON public.crm_call_log;
CREATE POLICY "Team can insert own call rows"
ON public.crm_call_log FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.is_active)
);

DROP POLICY IF EXISTS "Team can update own call rows" ON public.crm_call_log;
CREATE POLICY "Team can update own call rows"
ON public.crm_call_log FOR UPDATE TO authenticated
USING (
  agent_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS "Owners/admins can delete call rows" ON public.crm_call_log;
CREATE POLICY "Owners/admins can delete call rows"
ON public.crm_call_log FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin'))
);

DROP POLICY IF EXISTS "Voicemail drops visible to scope" ON public.crm_voicemail_drops;
CREATE POLICY "Voicemail drops visible to scope"
ON public.crm_voicemail_drops FOR SELECT TO authenticated
USING (
  (owner_scope = 'team'
    AND EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.is_active))
  OR owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Team members can manage own drops" ON public.crm_voicemail_drops;
CREATE POLICY "Team members can manage own drops"
ON public.crm_voicemail_drops FOR ALL TO authenticated
USING (
  owner_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin'))
)
WITH CHECK (
  owner_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin'))
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-voicemail-drops', 'crm-voicemail-drops', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team can read voicemail drop files" ON storage.objects;
CREATE POLICY "Team can read voicemail drop files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-voicemail-drops'
  AND EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.is_active)
);

DROP POLICY IF EXISTS "Team can upload voicemail drops" ON storage.objects;
CREATE POLICY "Team can upload voicemail drops"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-voicemail-drops'
  AND EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.is_active)
);

DROP POLICY IF EXISTS "Owner can delete own voicemail drops" ON storage.objects;
CREATE POLICY "Owner can delete own voicemail drops"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-voicemail-drops'
  AND (
    owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.crm_team t WHERE t.user_id = auth.uid() AND t.role IN ('owner','admin'))
  )
);

CREATE OR REPLACE FUNCTION public.crm_match_contact_by_phone(_phone text)
RETURNS TABLE (contact_id uuid, assigned_to text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH digits AS (SELECT regexp_replace(coalesce(_phone,''), '\D', '', 'g') AS d)
  SELECT c.id, c.assigned_to
  FROM public.crm_contacts c, digits
  WHERE digits.d <> ''
    AND (
      regexp_replace(coalesce(c.phone,''), '\D', '', 'g') = digits.d
      OR regexp_replace(coalesce(c.phone,''), '\D', '', 'g') = right(digits.d, 10)
      OR right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = right(digits.d, 10)
    )
  ORDER BY c.last_touch_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.crm_match_contact_by_phone(text) TO authenticated, service_role;
