-- Per-day rollup of Zara drafts
CREATE OR REPLACE VIEW public.zara_metrics_daily
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  intent,
  count(*)::int AS drafts,
  count(*) FILTER (WHERE status = 'sent')::int AS sent,
  count(*) FILTER (WHERE status = 'sent' AND COALESCE(edit_distance, 0) = 0)::int AS sent_unedited,
  count(*) FILTER (WHERE escalation_model IS NOT NULL)::int AS escalated,
  count(*) FILTER (WHERE escalate = true)::int AS flagged_for_human,
  round(avg(NULLIF(edit_distance, NULL))::numeric, 1) AS avg_edit_distance,
  round(avg(NULLIF(latency_ms, NULL))::numeric, 0)::int AS avg_latency_ms,
  round(avg(confidence)::numeric, 2) AS avg_confidence
FROM public.zara_suggested_replies
WHERE created_at >= now() - interval '90 days'
GROUP BY 1, 2;

-- Last-30d per-intent leaderboard
CREATE OR REPLACE VIEW public.zara_metrics_by_intent
WITH (security_invoker = on) AS
SELECT
  intent,
  count(*)::int AS drafts,
  count(*) FILTER (WHERE status = 'sent')::int AS sent,
  count(*) FILTER (WHERE status = 'sent' AND COALESCE(edit_distance, 0) = 0)::int AS sent_unedited,
  round(
    100.0 * count(*) FILTER (WHERE status = 'sent' AND COALESCE(edit_distance, 0) = 0)
    / NULLIF(count(*) FILTER (WHERE status = 'sent'), 0),
    1
  ) AS unedited_pct,
  round(avg(NULLIF(edit_distance, NULL))::numeric, 1) AS avg_edit_distance,
  round(avg(confidence)::numeric, 2) AS avg_confidence
FROM public.zara_suggested_replies
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY drafts DESC;

-- Helper: recent high-edit drafts for pattern spotting (admin/owner only)
CREATE OR REPLACE FUNCTION public.zara_recent_high_edits(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  intent text,
  channel text,
  draft_text text,
  edited_text text,
  edit_distance int,
  guardrails_hit text[],
  model text,
  escalation_model text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, created_at, intent, channel, draft_text, edited_text, edit_distance, guardrails_hit, model, escalation_model
  FROM public.zara_suggested_replies
  WHERE status = 'sent'
    AND edited_text IS NOT NULL
    AND COALESCE(edit_distance, 0) > 0
    AND created_at >= now() - interval '30 days'
    AND EXISTS (
      SELECT 1 FROM public.crm_team ct
      WHERE ct.user_id = auth.uid()
        AND ct.role IN ('owner', 'admin')
    )
  ORDER BY edit_distance DESC, created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

GRANT SELECT ON public.zara_metrics_daily TO authenticated;
GRANT SELECT ON public.zara_metrics_by_intent TO authenticated;
GRANT EXECUTE ON FUNCTION public.zara_recent_high_edits(int) TO authenticated;