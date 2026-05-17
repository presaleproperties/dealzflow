
CREATE TABLE IF NOT EXISTS public.crm_zara_outbound_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  draft_id uuid,
  channel text,
  trigger_kind text,
  template_key text,
  rule_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  confidence numeric,
  subject text,
  decision text NOT NULL,
  decision_reason text,
  provider_message_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_zara_outbound_audit_contact ON public.crm_zara_outbound_audit (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_outbound_audit_draft ON public.crm_zara_outbound_audit (draft_id);
CREATE INDEX IF NOT EXISTS idx_zara_outbound_audit_created ON public.crm_zara_outbound_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zara_outbound_audit_decision ON public.crm_zara_outbound_audit (decision);

ALTER TABLE public.crm_zara_outbound_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit readable by admin or contact-visible agent" ON public.crm_zara_outbound_audit;
CREATE POLICY "audit readable by admin or contact-visible agent"
ON public.crm_zara_outbound_audit
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (contact_id IS NOT NULL AND public.crm_can_see_contact_id(auth.uid(), contact_id))
);

DROP TRIGGER IF EXISTS trg_zara_outbound_audit_updated_at ON public.crm_zara_outbound_audit;
CREATE TRIGGER trg_zara_outbound_audit_updated_at
BEFORE UPDATE ON public.crm_zara_outbound_audit
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
