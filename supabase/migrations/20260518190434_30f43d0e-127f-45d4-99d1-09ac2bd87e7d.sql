
-- 1. Snooze support on nudges
ALTER TABLE public.zara_proactive_nudges
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_zara_nudges_open
  ON public.zara_proactive_nudges (agent_user_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- 2. Outcome tracking on drafts
ALTER TABLE public.zara_suggested_replies
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS booked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS outcome    text;

ALTER TABLE public.zara_suggested_replies
  DROP CONSTRAINT IF EXISTS zara_suggested_replies_outcome_check;
ALTER TABLE public.zara_suggested_replies
  ADD CONSTRAINT zara_suggested_replies_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('none','replied','booked','no_response'));

CREATE INDEX IF NOT EXISTS idx_zara_drafts_assigned_sent
  ON public.zara_suggested_replies (assigned_to, sent_at DESC)
  WHERE sent_at IS NOT NULL;

-- 3. Today feed RPC
CREATE OR REPLACE FUNCTION public.zara_today_feed(p_user uuid DEFAULT auth.uid())
RETURNS TABLE (
  kind          text,
  item_id       uuid,
  contact_id    uuid,
  title         text,
  body          text,
  priority      int,
  created_at    timestamptz,
  payload       jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Pending drafts (highest priority)
  SELECT
    'draft'::text                         AS kind,
    d.id                                  AS item_id,
    d.contact_id,
    COALESCE(d.draft_subject,
             'Reply on ' || d.channel)    AS title,
    LEFT(COALESCE(d.draft_text,''), 240)  AS body,
    1                                     AS priority,
    d.created_at,
    jsonb_build_object(
      'channel', d.channel,
      'intent',  d.intent,
      'confidence', d.confidence,
      'inbound_text', d.inbound_text
    ) AS payload
  FROM public.zara_suggested_replies d
  WHERE d.status = 'pending'
    AND (d.assigned_to = p_user OR public.is_crm_admin_or_owner(p_user))
    AND d.expires_at > now()

  UNION ALL

  -- Unread handoff briefs
  SELECT
    'handoff'::text,
    h.id,
    h.contact_id,
    COALESCE('Handoff: ' || h.summary, 'New handoff brief'),
    LEFT(COALESCE(h.summary,''), 240),
    2,
    h.created_at,
    h.brief
  FROM public.zara_handoff_briefs h
  WHERE h.read_at IS NULL
    AND (h.to_agent_user_id = p_user OR public.is_crm_admin_or_owner(p_user))

  UNION ALL

  -- Open, non-snoozed nudges
  SELECT
    'nudge'::text,
    n.id,
    n.contact_id,
    n.title,
    LEFT(COALESCE(n.body,''), 240),
    CASE n.kind
      WHEN 'risk_scan'     THEN 2
      WHEN 'return_visit'  THEN 2
      WHEN 'daily_standup' THEN 3
      WHEN 'weekly_review' THEN 4
      ELSE 3
    END,
    n.created_at,
    n.payload || jsonb_build_object('nudge_kind', n.kind)
  FROM public.zara_proactive_nudges n
  WHERE n.resolved_at IS NULL
    AND (n.snoozed_until IS NULL OR n.snoozed_until <= now())
    AND (n.agent_user_id = p_user OR public.is_crm_admin_or_owner(p_user))

  ORDER BY priority ASC, created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.zara_today_feed(uuid) TO authenticated;

-- 4. Resolve / snooze nudge
CREATE OR REPLACE FUNCTION public.zara_resolve_nudge(
  p_nudge_id uuid,
  p_action   text,           -- 'done' | 'snooze' | 'dismiss'
  p_hours    int DEFAULT 4
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_action = 'snooze' THEN
    UPDATE public.zara_proactive_nudges
       SET snoozed_until = now() + make_interval(hours => GREATEST(1, p_hours))
     WHERE id = p_nudge_id
       AND (agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()));
  ELSE
    UPDATE public.zara_proactive_nudges
       SET resolved_at = now()
     WHERE id = p_nudge_id
       AND (agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.zara_resolve_nudge(uuid, text, int) TO authenticated;

-- 5. Mark handoff read
CREATE OR REPLACE FUNCTION public.zara_mark_handoff_read(p_brief_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.zara_handoff_briefs
     SET read_at = now()
   WHERE id = p_brief_id
     AND (to_agent_user_id = auth.uid() OR public.is_crm_admin_or_owner(auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.zara_mark_handoff_read(uuid) TO authenticated;

-- 6. Draft outcome rollup view (last 90 days)
CREATE OR REPLACE VIEW public.zara_draft_outcomes_v1 AS
SELECT
  d.assigned_to                                                       AS agent_user_id,
  date_trunc('week', d.sent_at)                                       AS week,
  COUNT(*) FILTER (WHERE d.sent_at IS NOT NULL)                       AS sent,
  COUNT(*) FILTER (WHERE d.replied_at IS NOT NULL)                    AS replied,
  COUNT(*) FILTER (WHERE d.booked_at  IS NOT NULL)                    AS booked,
  COUNT(*) FILTER (WHERE d.edit_distance IS NOT NULL AND d.edit_distance > 0) AS edited,
  ROUND(AVG(NULLIF(d.edit_distance,0))::numeric, 1)                   AS avg_edit_distance
FROM public.zara_suggested_replies d
WHERE d.sent_at >= now() - interval '90 days'
GROUP BY 1, 2;

GRANT SELECT ON public.zara_draft_outcomes_v1 TO authenticated;
