-- Allow 'chat_inline' as a valid decided_via origin for Zara approvals.
ALTER TABLE public.zara_approval_decisions
  DROP CONSTRAINT IF EXISTS zara_approval_decisions_decided_via_check;

ALTER TABLE public.zara_approval_decisions
  ADD CONSTRAINT zara_approval_decisions_decided_via_check
  CHECK (decided_via = ANY (ARRAY[
    'whatsapp_thumbs'::text,
    'crm_button'::text,
    'auto_expire'::text,
    'chat_inline'::text
  ]));