ALTER TABLE public.crm_zara_drafts DROP CONSTRAINT IF EXISTS crm_zara_drafts_trigger_kind_check;
ALTER TABLE public.crm_zara_drafts
  ADD CONSTRAINT crm_zara_drafts_trigger_kind_check
  CHECK (trigger_kind IN ('cold_nudge','new_lead_welcome','presale_burst','post_showing','initial_outreach','manual'));