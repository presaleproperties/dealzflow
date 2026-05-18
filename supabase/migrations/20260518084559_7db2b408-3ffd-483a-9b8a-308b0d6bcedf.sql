-- Allow agents to create their own proactive nudges (e.g., schedule a follow-up
-- from the lead detail Engage panel). Adds optional scheduled_for + created_by.
ALTER TABLE public.zara_proactive_nudges
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS created_by    uuid;

CREATE INDEX IF NOT EXISTS idx_zara_nudges_scheduled
  ON public.zara_proactive_nudges(scheduled_for)
  WHERE scheduled_for IS NOT NULL AND resolved_at IS NULL;

DROP POLICY IF EXISTS "agents insert their nudges" ON public.zara_proactive_nudges;
CREATE POLICY "agents insert their nudges"
  ON public.zara_proactive_nudges FOR INSERT TO authenticated
  WITH CHECK (
    -- Agent creating a nudge for themselves OR for a contact they can see
    (created_by = auth.uid())
    AND (
      agent_user_id IS NULL
      OR agent_user_id = auth.uid()
      OR public.is_crm_admin_or_owner(auth.uid())
    )
    AND (
      contact_id IS NULL
      OR public.crm_can_see_contact_id(auth.uid(), contact_id)
    )
  );