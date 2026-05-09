-- =========================================================
-- Unified Lead Timeline v2
-- =========================================================

-- 1) Pin table -------------------------------------------------
create table if not exists public.crm_timeline_pins (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  event_kind text not null,
  event_id text not null,
  pinned_by uuid not null,
  pinned_at timestamptz not null default now(),
  unique (contact_id, event_kind, event_id)
);

create index if not exists idx_crm_timeline_pins_contact
  on public.crm_timeline_pins (contact_id, pinned_at desc);

alter table public.crm_timeline_pins enable row level security;

drop policy if exists "Timeline pins visible to lead viewers" on public.crm_timeline_pins;
create policy "Timeline pins visible to lead viewers"
  on public.crm_timeline_pins for select
  to authenticated
  using (public.crm_can_see_contact_id(auth.uid(), contact_id));

drop policy if exists "Timeline pins manageable by lead viewers" on public.crm_timeline_pins;
create policy "Timeline pins manageable by lead viewers"
  on public.crm_timeline_pins for all
  to authenticated
  using (public.crm_can_see_contact_id(auth.uid(), contact_id))
  with check (public.crm_can_see_contact_id(auth.uid(), contact_id) and pinned_by = auth.uid());

-- 2) Unified timeline function --------------------------------
create or replace function public.crm_lead_timeline_v2(
  p_contact_id uuid,
  p_kinds      text[] default null,
  p_search     text   default null,
  p_before     timestamptz default null,
  p_limit      int    default 50
)
returns table (
  event_id    text,
  kind        text,
  sub_kind    text,
  direction   text,
  occurred_at timestamptz,
  title       text,
  subtitle    text,
  body_excerpt text,
  importance  int,
  metadata    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select public.crm_can_see_contact_id(auth.uid(), p_contact_id) as ok
  ),
  raw as (
    -- NOTES (manual notes only — drop "auto" to avoid noise)
    select
      'note:' || n.id::text                                     as event_id,
      'note'::text                                              as kind,
      coalesce(n.note_type, 'manual')                           as sub_kind,
      null::text                                                as direction,
      coalesce(n.event_at, n.created_at)                        as occurred_at,
      'Note'::text                                              as title,
      null::text                                                as subtitle,
      n.content                                                 as body_excerpt,
      case when coalesce(n.is_pinned, false) then 6 else 3 end  as importance,
      jsonb_build_object('note_type', n.note_type, 'pinned', n.is_pinned) as metadata
    from public.crm_notes n
    where n.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- EMAIL LOG (sent + open/click events derived from counters)
    select
      'email:' || e.id::text,
      'email',
      e.direction,
      e.direction,
      e.sent_at,
      coalesce(nullif(e.subject, ''), '(no subject)'),
      case
        when e.click_count > 0 then 'Clicked ' || e.click_count::text || 'x · Opened ' || e.open_count::text || 'x'
        when e.open_count  > 0 then 'Opened ' || e.open_count::text || 'x'
        else null
      end,
      e.body,
      case
        when e.direction = 'inbound'        then 7   -- reply
        when e.click_count > 0              then 4
        when e.open_count  > 0              then 2
        else 1
      end,
      jsonb_build_object(
        'thread_id', e.thread_id,
        'gmail_thread_id', e.gmail_thread_id,
        'open_count', e.open_count,
        'click_count', e.click_count,
        'last_opened_at', e.last_opened_at,
        'last_clicked_at', e.last_clicked_at
      )
    from public.crm_email_log e
    where e.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- SMS / WhatsApp
    select
      'sms:' || s.id::text,
      'sms',
      s.channel,
      s.direction,
      s.sent_at,
      case s.direction
        when 'inbound'  then 'SMS received'
        else 'SMS sent'
      end,
      case when array_length(s.media_urls, 1) > 0 then 'MMS · ' || s.status else s.status end,
      s.body,
      case
        when s.direction = 'inbound' then 6
        when s.status in ('failed', 'undelivered') then 4
        else 2
      end,
      jsonb_build_object('status', s.status, 'media_urls', s.media_urls, 'channel', s.channel)
    from public.crm_sms_log s
    where s.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- PRESALE BEHAVIOR — generic activity events
    select
      'activity:' || a.id::text,
      'behavior',
      a.type,
      'in',
      a.occurred_at,
      initcap(replace(a.type, '_', ' ')),
      coalesce(a.project_slug, null),
      null,
      case a.type
        when 'floorplan_download' then 10
        when 'deck_revisit'       then 9
        when 'deck_open'          then 7
        when 'page_view'          then 2
        else 4
      end,
      a.metadata
    from public.crm_activity_events a
    where a.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- BEHAVIOR: page / property views
    select
      'view:' || v.id::text,
      'behavior',
      'view',
      'in',
      v.viewed_at,
      coalesce(v.property_name, 'Property view'),
      v.property_url,
      null,
      case when coalesce(v.duration_seconds, 0) > 60 then 4 else 2 end,
      jsonb_build_object('property_id', v.property_id, 'duration_seconds', v.duration_seconds)
    from public.crm_lead_behavior_views v
    where v.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- BEHAVIOR: form submissions
    select
      'form:' || f.id::text,
      'form',
      f.form_type,
      'in',
      f.submitted_at,
      coalesce(f.form_name, initcap(replace(f.form_type, '_', ' '))),
      f.property_name,
      null,
      8,
      coalesce(f.payload, '{}'::jsonb) || jsonb_build_object('property_id', f.property_id)
    from public.crm_lead_behavior_forms f
    where f.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- BEHAVIOR: email opens / clicks from Presale campaigns
    select
      'engage:' || g.id::text,
      'engagement',
      g.event_type,
      'in',
      g.occurred_at,
      case g.event_type
        when 'email_open'  then 'Email opened'
        when 'email_click' then 'Link clicked'
        else initcap(replace(g.event_type, '_', ' '))
      end,
      coalesce(g.campaign_name, g.template_name),
      g.link_url,
      case g.event_type
        when 'email_click' then 4
        when 'email_open'  then 2
        else 3
      end,
      jsonb_build_object('campaign_id', g.campaign_id, 'template_id', g.template_id, 'link_url', g.link_url)
    from public.crm_lead_behavior_engagement g
    where g.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- SHOWINGS
    select
      'showing:' || sh.id::text,
      'showing',
      sh.status,
      null,
      (sh.showing_date::timestamp + sh.showing_time)::timestamptz,
      'Showing · ' || sh.project,
      sh.unit,
      sh.notes,
      7,
      jsonb_build_object('project', sh.project, 'unit', sh.unit, 'agent', sh.assigned_agent, 'status', sh.status)
    from public.crm_showings sh
    where sh.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- TASKS (created)
    select
      'task:' || t.id::text,
      'task',
      coalesce(t.task_type, 'task'),
      null,
      t.created_at,
      t.title,
      t.description,
      null,
      case t.priority when 'high' then 6 when 'low' then 2 else 4 end,
      jsonb_build_object('status', t.status, 'priority', t.priority, 'due_date', t.due_date)
    from public.crm_tasks t
    where t.contact_id = p_contact_id
      and (select ok from allowed)

    union all

    -- SCHEDULER BOOKINGS (Calendly-style)
    select
      'booking:' || b.id::text,
      'booking',
      b.status,
      null,
      b.start_at,
      'Booking · ' || coalesce(b.location_type, 'meeting'),
      b.invitee_first_name || ' ' || b.invitee_last_name,
      b.notes_for_agent,
      8,
      jsonb_build_object('end_at', b.end_at, 'meeting_link', b.meeting_link, 'status', b.status)
    from public.crm_scheduler_bookings b
    where b.contact_id = p_contact_id
      and (select ok from allowed)
  )
  select
    r.event_id,
    r.kind,
    r.sub_kind,
    r.direction,
    r.occurred_at,
    r.title,
    r.subtitle,
    case when r.body_excerpt is null then null
         else left(regexp_replace(r.body_excerpt, '\s+', ' ', 'g'), 280) end as body_excerpt,
    r.importance,
    r.metadata
  from raw r
  where (p_kinds is null or r.kind = any(p_kinds))
    and (p_before is null or r.occurred_at < p_before)
    and (
      p_search is null
      or p_search = ''
      or r.title       ilike '%' || p_search || '%'
      or coalesce(r.subtitle, '')      ilike '%' || p_search || '%'
      or coalesce(r.body_excerpt, '')  ilike '%' || p_search || '%'
    )
  order by r.occurred_at desc
  limit greatest(1, least(p_limit, 200));
$$;

grant execute on function public.crm_lead_timeline_v2(uuid, text[], text, timestamptz, int) to authenticated;