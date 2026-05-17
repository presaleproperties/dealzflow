
CREATE OR REPLACE VIEW public.zara_tool_usage_30d AS
SELECT
  tool_name,
  COUNT(*)::int AS calls,
  COUNT(DISTINCT contact_id)::int AS leads_touched,
  COUNT(*) FILTER (WHERE result_summary ILIKE '%"ok":false%' OR result_summary ILIKE '%error%')::int AS failures,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE result_summary ILIKE '%"ok":false%' OR result_summary ILIKE '%error%')
    / NULLIF(COUNT(*),0), 1
  ) AS failure_pct,
  MAX(occurred_at) AS last_used_at
FROM public.zara_actions_log
WHERE action = 'tool_call'
  AND tool_name IS NOT NULL
  AND occurred_at >= now() - interval '30 days'
GROUP BY tool_name
ORDER BY calls DESC;

CREATE OR REPLACE VIEW public.zara_tool_daily_30d AS
SELECT
  tool_name,
  date_trunc('day', occurred_at)::date AS day,
  COUNT(*)::int AS calls
FROM public.zara_actions_log
WHERE action = 'tool_call'
  AND tool_name IS NOT NULL
  AND occurred_at >= now() - interval '30 days'
GROUP BY tool_name, day
ORDER BY day DESC;

CREATE OR REPLACE VIEW public.zara_tool_conversion_30d AS
WITH touched AS (
  SELECT DISTINCT tool_name, contact_id, MIN(occurred_at) AS first_touch
  FROM public.zara_actions_log
  WHERE action = 'tool_call'
    AND tool_name IS NOT NULL
    AND contact_id IS NOT NULL
    AND occurred_at >= now() - interval '30 days'
  GROUP BY tool_name, contact_id
),
converted AS (
  SELECT t.tool_name, t.contact_id
  FROM touched t
  WHERE EXISTS (
    SELECT 1 FROM public.zara_suggested_replies r
    WHERE r.contact_id = t.contact_id
      AND r.sent_at IS NOT NULL
      AND r.sent_at >= t.first_touch
      AND r.sent_at <= t.first_touch + interval '14 days'
  )
)
SELECT
  t.tool_name,
  COUNT(*)::int AS leads_touched,
  (SELECT COUNT(*) FROM converted c WHERE c.tool_name = t.tool_name)::int AS leads_converted,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM converted c WHERE c.tool_name = t.tool_name)
    / NULLIF(COUNT(*),0), 1
  ) AS conversion_pct
FROM touched t
GROUP BY t.tool_name
ORDER BY conversion_pct DESC NULLS LAST;

GRANT SELECT ON public.zara_tool_usage_30d TO authenticated;
GRANT SELECT ON public.zara_tool_daily_30d TO authenticated;
GRANT SELECT ON public.zara_tool_conversion_30d TO authenticated;
