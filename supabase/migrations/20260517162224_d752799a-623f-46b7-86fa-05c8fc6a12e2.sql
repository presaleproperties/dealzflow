-- Append-only engagement event log
CREATE TABLE public.crm_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  direction text,
  -- campaign_id is a soft reference: may point at crm_email_campaigns or
  -- crm_sms_campaigns, so no FK constraint.
  campaign_id uuid,
  thread_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_engagement_events_contact_occurred_idx
  ON public.crm_engagement_events (contact_id, occurred_at DESC);
CREATE INDEX crm_engagement_events_type_occurred_idx
  ON public.crm_engagement_events (event_type, occurred_at DESC);
CREATE INDEX crm_engagement_events_campaign_idx
  ON public.crm_engagement_events (campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX crm_engagement_events_actor_occurred_idx
  ON public.crm_engagement_events (actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;

ALTER TABLE public.crm_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_events_select_authenticated"
  ON public.crm_engagement_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "engagement_events_insert_self_or_system"
  ON public.crm_engagement_events
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

-- Per-contact summary view used by reports + lead detail widgets.
CREATE OR REPLACE VIEW public.crm_contact_last_touch AS
SELECT
  contact_id,
  MAX(occurred_at) FILTER (
    WHERE event_type IN ('email_sent','sms_sent','whatsapp_sent','call_made')
  ) AS last_outbound_at,
  MAX(occurred_at) FILTER (
    WHERE event_type IN (
      'email_replied','sms_replied','whatsapp_replied',
      'call_received','email_opened','email_clicked','whatsapp_read'
    )
  ) AS last_inbound_at,
  MAX(occurred_at) AS last_event_at,
  COUNT(*) FILTER (
    WHERE event_type IN ('email_opened','email_clicked','whatsapp_read')
  ) AS engagement_signal_count
FROM public.crm_engagement_events
GROUP BY contact_id;

GRANT SELECT ON public.crm_contact_last_touch TO authenticated;