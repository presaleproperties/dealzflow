CREATE OR REPLACE FUNCTION public.crm_lead_timeline_v2(
  p_contact_id uuid,
  p_kinds      text[] DEFAULT NULL,
  p_search     text   DEFAULT NULL,
  p_before     timestamptz DEFAULT NULL,
  p_limit      integer DEFAULT 50
)
RETURNS TABLE (
  event_id    text,
  kind        text,
  sub_kind    text,
  direction   text,
  occurred_at timestamptz,
  title       text,
  subtitle    text,
  body_excerpt text,
  importance  integer,
  metadata    jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH allowed AS (
    SELECT public.crm_can_see_contact_id(auth.uid(), p_contact_id) AS ok
  ),
  rows AS (
    SELECT
      'note:' || n.id::text       AS event_id,
      'note'::text                AS kind,
      n.note_type::text           AS sub_kind,
      NULL::text                  AS direction,
      n.created_at                AS occurred_at,
      'Note'::text                AS title,
      NULL::text                  AS subtitle,
      LEFT(COALESCE(n.content, ''), 280) AS body_excerpt,
      3                           AS importance,
      jsonb_build_object('note_type', n.note_type)
    FROM public.crm_notes n
    WHERE n.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'email:' || e.id::text,
      'email',
      e.status::text,
      CASE WHEN e.direction = 'inbound' THEN 'in' ELSE 'out' END,
      e.created_at,
      COALESCE(NULLIF(e.subject, ''), '(no subject)'),
      CASE
        WHEN e.direction = 'inbound' THEN 'From ' || COALESCE(e.from_email, 'unknown')
        ELSE 'To ' || COALESCE(e.to_email, 'recipient')
      END,
      LEFT(COALESCE(e.body_text, e.body_html, ''), 280),
      CASE WHEN e.direction = 'inbound' THEN 7 ELSE 3 END,
      jsonb_build_object('status', e.status, 'gmail_message_id', e.gmail_message_id)
    FROM public.crm_email_log e
    WHERE e.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'sms:' || s.id::text,
      'sms',
      s.status::text,
      CASE WHEN s.direction = 'inbound' THEN 'in' ELSE 'out' END,
      s.created_at,
      CASE WHEN s.direction = 'inbound' THEN 'Text received' ELSE 'Text sent' END,
      NULL,
      LEFT(COALESCE(s.body, ''), 280),
      CASE
        WHEN s.direction = 'inbound' THEN 7
        WHEN s.status IN ('failed', 'undelivered') THEN 4
        ELSE 2
      END,
      jsonb_build_object('status', s.status, 'media_urls', s.media_urls, 'channel', s.channel)
    FROM public.crm_sms_log s
    WHERE s.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'activity:' || a.id::text,
      CASE
        WHEN a.type IN ('email_open','email_opened','email_click','email_clicked','email_sent','email.sent','email.auto_response_sent')
          THEN 'engagement'
        WHEN a.type IN ('contact_form','form_start','form_abandoned','vip_registration')
          THEN 'form'
        ELSE 'behavior'
      END,
      a.type,
      'in',
      a.occurred_at,
      CASE
        WHEN a.type = 'behavior_batch' THEN
          CASE
            WHEN COALESCE(a.metadata->>'page_title','') <> ''
              THEN 'Visited ' || (a.metadata->>'page_title')
            WHEN COALESCE(a.metadata->>'page_path','') <> ''
              THEN 'Visited ' || (a.metadata->>'page_path')
            WHEN jsonb_array_length(COALESCE(a.metadata->'behavior'->'sessions','[]'::jsonb)) > 0
              THEN 'Browsed the site'
            ELSE 'Website activity'
          END
        WHEN a.type = 'page_view'           THEN 'Viewed a page'
        WHEN a.type = 'return_visit'        THEN 'Came back to the site'
        WHEN a.type = 'floorplan_download'  THEN 'Downloaded a floorplan'
        WHEN a.type = 'deck_open'           THEN 'Opened a project deck'
        WHEN a.type = 'deck_revisit'        THEN 'Returned to a project deck'
        WHEN a.type = 'contact_form'        THEN 'Submitted contact form'
        WHEN a.type = 'form_start'          THEN 'Started a form'
        WHEN a.type = 'form_abandoned'      THEN 'Abandoned a form'
        WHEN a.type = 'vip_registration'    THEN 'Registered for VIP access'
        WHEN a.type = 'lead.created'        THEN 'Lead created'
        WHEN a.type = 'lead.approved'       THEN 'Lead approved'
        WHEN a.type IN ('email_sent','email.sent')          THEN 'Email sent'
        WHEN a.type = 'email.auto_response_sent'            THEN 'Auto-response sent'
        WHEN a.type IN ('email_open','email_opened')        THEN 'Opened an email'
        WHEN a.type IN ('email_click','email_clicked')      THEN 'Clicked a link in an email'
        ELSE initcap(replace(a.type, '_', ' '))
      END,
      CASE
        WHEN a.type = 'behavior_batch' THEN
          NULLIF(
            CASE
              WHEN (a.metadata->'behavior'->'sessions'->0->>'pages_viewed') IS NOT NULL
                THEN COALESCE(a.project_slug, '') ||
                     CASE WHEN COALESCE(a.project_slug,'') <> '' THEN ' · ' ELSE '' END ||
                     ((a.metadata->'behavior'->'sessions'->0->>'pages_viewed') || ' pages')
              ELSE COALESCE(a.project_slug, '')
            END,
            '')
        ELSE COALESCE(a.project_slug, NULL)
      END,
      NULL,
      CASE
        WHEN a.type = 'floorplan_download'        THEN 10
        WHEN a.type = 'deck_revisit'              THEN 9
        WHEN a.type = 'deck_open'                 THEN 7
        WHEN a.type = 'contact_form'              THEN 9
        WHEN a.type = 'vip_registration'          THEN 9
        WHEN a.type = 'form_start'                THEN 5
        WHEN a.type = 'form_abandoned'            THEN 5
        WHEN a.type = 'return_visit'              THEN 5
        WHEN a.type IN ('email_click','email_clicked') THEN 4
        WHEN a.type IN ('email_open','email_opened')   THEN 2
        WHEN a.type = 'page_view'                 THEN 2
        WHEN a.type = 'behavior_batch'            THEN 2
        ELSE 4
      END,
      a.metadata
    FROM public.crm_activity_events a
    WHERE a.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)
      AND NOT (
        a.type = 'behavior_batch'
        AND COALESCE(a.metadata->>'page_title','') = ''
        AND COALESCE(a.metadata->>'page_path','')  = ''
        AND COALESCE(a.metadata->>'page_url','')   = ''
        AND jsonb_array_length(COALESCE(a.metadata->'behavior'->'forms','[]'::jsonb))      = 0
        AND jsonb_array_length(COALESCE(a.metadata->'behavior'->'views','[]'::jsonb))      = 0
        AND jsonb_array_length(COALESCE(a.metadata->'behavior'->'sessions','[]'::jsonb))   = 0
        AND jsonb_array_length(COALESCE(a.metadata->'behavior'->'engagement','[]'::jsonb)) = 0
      )

    UNION ALL

    SELECT
      'view:' || v.id::text,
      'behavior',
      'view',
      'in',
      v.viewed_at,
      'Viewed ' || COALESCE(NULLIF(v.property_name, ''), 'a property'),
      v.property_url,
      NULL,
      CASE WHEN COALESCE(v.duration_seconds, 0) > 60 THEN 4 ELSE 2 END,
      jsonb_build_object('property_id', v.property_id, 'duration_seconds', v.duration_seconds)
    FROM public.crm_lead_behavior_views v
    WHERE v.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'form:' || f.id::text,
      'form',
      f.form_type,
      'in',
      f.submitted_at,
      'Submitted ' || COALESCE(NULLIF(f.form_name, ''), initcap(replace(f.form_type, '_', ' '))),
      f.property_name,
      NULL,
      8,
      COALESCE(f.payload, '{}'::jsonb) || jsonb_build_object('property_id', f.property_id)
    FROM public.crm_lead_behavior_forms f
    WHERE f.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'engage:' || g.id::text,
      'engagement',
      g.event_type,
      'in',
      g.occurred_at,
      CASE g.event_type
        WHEN 'email_open'  THEN 'Opened an email'
        WHEN 'email_click' THEN 'Clicked a link in an email'
        ELSE initcap(replace(g.event_type, '_', ' '))
      END,
      COALESCE(g.campaign_name, g.template_name),
      g.link_url,
      CASE g.event_type
        WHEN 'email_click' THEN 4
        WHEN 'email_open'  THEN 2
        ELSE 3
      END,
      jsonb_build_object('campaign_id', g.campaign_id, 'template_id', g.template_id, 'link_url', g.link_url)
    FROM public.crm_lead_behavior_engagement g
    WHERE g.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'showing:' || sh.id::text,
      'showing',
      sh.status,
      NULL,
      sh.scheduled_at,
      'Showing · ' || COALESCE(sh.status, 'scheduled'),
      sh.location,
      sh.notes,
      6,
      jsonb_build_object('status', sh.status)
    FROM public.crm_showings sh
    WHERE sh.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)

    UNION ALL

    SELECT
      'task:' || t.id::text,
      'task',
      t.status,
      NULL,
      COALESCE(t.completed_at, t.due_at, t.created_at),
      CASE WHEN t.status = 'done' THEN 'Completed task: ' ELSE 'Task: ' END || COALESCE(t.title,'(untitled)'),
      NULL,
      LEFT(COALESCE(t.description, ''), 240),
      CASE WHEN t.status = 'done' THEN 5 ELSE 3 END,
      jsonb_build_object('status', t.status, 'due_at', t.due_at)
    FROM public.crm_tasks t
    WHERE t.contact_id = p_contact_id
      AND (SELECT ok FROM allowed)
  )
  SELECT
    r.event_id, r.kind, r.sub_kind, r.direction, r.occurred_at,
    r.title, r.subtitle, r.body_excerpt, r.importance, r.metadata
  FROM rows r
  WHERE (p_before IS NULL OR r.occurred_at < p_before)
    AND (p_kinds IS NULL OR r.kind = ANY(p_kinds))
    AND (
      p_search IS NULL OR p_search = ''
      OR r.title                       ILIKE '%' || p_search || '%'
      OR COALESCE(r.subtitle, '')      ILIKE '%' || p_search || '%'
      OR COALESCE(r.body_excerpt, '')  ILIKE '%' || p_search || '%'
    )
  ORDER BY r.occurred_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;