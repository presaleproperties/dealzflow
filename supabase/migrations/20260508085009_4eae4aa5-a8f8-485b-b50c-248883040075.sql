
-- Template sync log: tracks pull/push/test-send events per template
CREATE TABLE public.crm_template_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.crm_email_templates(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('pull','push','test')),
  status TEXT NOT NULL CHECK (status IN ('success','error','pending')),
  bridge_endpoint TEXT,
  payload_summary JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_template_sync_log_template
  ON public.crm_template_sync_log (template_id, created_at DESC);
CREATE INDEX idx_crm_template_sync_log_actor
  ON public.crm_template_sync_log (actor_id, created_at DESC);

ALTER TABLE public.crm_template_sync_log ENABLE ROW LEVEL SECURITY;

-- Read: same gating as templates (owner slug or admin/owner)
CREATE POLICY "sync_log_read_own_or_admin"
ON public.crm_template_sync_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_team t
    WHERE t.user_id = auth.uid()
      AND t.role IN ('owner','admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.crm_email_templates et
    WHERE et.id = crm_template_sync_log.template_id
      AND (
        et.owner_scope = 'team:presale'
        OR et.owner_agent_slug = public.crm_my_presale_slug()
      )
  )
);

-- No client-side INSERT/UPDATE/DELETE; only edge functions via service role write.
