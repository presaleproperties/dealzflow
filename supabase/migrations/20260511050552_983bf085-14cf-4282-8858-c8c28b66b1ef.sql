-- =========================================================================
-- TEMPLATES 2.0 — folders, tags, favorites, featured/locked flags, stats
-- =========================================================================

-- ---- 1. Folders ---------------------------------------------------------
create table if not exists public.crm_template_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  channel text not null default 'both' check (channel in ('email','sms','both')),
  sort_order int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_template_folders enable row level security;

drop policy if exists "CRM members can read folders" on public.crm_template_folders;
create policy "CRM members can read folders"
on public.crm_template_folders for select to authenticated
using (is_crm_member(auth.uid()));

drop policy if exists "CRM members can create folders" on public.crm_template_folders;
create policy "CRM members can create folders"
on public.crm_template_folders for insert to authenticated
with check (is_crm_member(auth.uid()) and created_by = auth.uid());

drop policy if exists "Owner or admin can update folders" on public.crm_template_folders;
create policy "Owner or admin can update folders"
on public.crm_template_folders for update to authenticated
using (created_by = auth.uid() or is_crm_admin(auth.uid()));

drop policy if exists "Owner or admin can delete folders" on public.crm_template_folders;
create policy "Owner or admin can delete folders"
on public.crm_template_folders for delete to authenticated
using (created_by = auth.uid() or is_crm_admin(auth.uid()));

-- ---- 2. Folder items (link template <-> folder) -------------------------
create table if not exists public.crm_template_folder_items (
  folder_id uuid not null references public.crm_template_folders(id) on delete cascade,
  template_id uuid not null,
  template_kind text not null check (template_kind in ('email','sms')),
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (folder_id, template_id, template_kind)
);
alter table public.crm_template_folder_items enable row level security;

drop policy if exists "CRM members can read folder items" on public.crm_template_folder_items;
create policy "CRM members can read folder items"
on public.crm_template_folder_items for select to authenticated
using (is_crm_member(auth.uid()));

drop policy if exists "CRM members can write folder items" on public.crm_template_folder_items;
create policy "CRM members can write folder items"
on public.crm_template_folder_items for insert to authenticated
with check (is_crm_member(auth.uid()));

drop policy if exists "CRM members can delete folder items" on public.crm_template_folder_items;
create policy "CRM members can delete folder items"
on public.crm_template_folder_items for delete to authenticated
using (is_crm_member(auth.uid()));

create index if not exists idx_template_folder_items_template
  on public.crm_template_folder_items (template_id, template_kind);

-- ---- 3. Tags ------------------------------------------------------------
create table if not exists public.crm_template_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_template_tags_label_lc
  on public.crm_template_tags (lower(label));
alter table public.crm_template_tags enable row level security;

drop policy if exists "CRM members can read tags" on public.crm_template_tags;
create policy "CRM members can read tags"
on public.crm_template_tags for select to authenticated
using (is_crm_member(auth.uid()));

drop policy if exists "CRM members can create tags" on public.crm_template_tags;
create policy "CRM members can create tags"
on public.crm_template_tags for insert to authenticated
with check (is_crm_member(auth.uid()) and created_by = auth.uid());

drop policy if exists "Admin can delete tags" on public.crm_template_tags;
create policy "Admin can delete tags"
on public.crm_template_tags for delete to authenticated
using (is_crm_admin(auth.uid()) or created_by = auth.uid());

-- ---- 4. Tag items -------------------------------------------------------
create table if not exists public.crm_template_tag_items (
  tag_id uuid not null references public.crm_template_tags(id) on delete cascade,
  template_id uuid not null,
  template_kind text not null check (template_kind in ('email','sms')),
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (tag_id, template_id, template_kind)
);
alter table public.crm_template_tag_items enable row level security;

drop policy if exists "CRM members can read tag items" on public.crm_template_tag_items;
create policy "CRM members can read tag items"
on public.crm_template_tag_items for select to authenticated
using (is_crm_member(auth.uid()));

drop policy if exists "CRM members can write tag items" on public.crm_template_tag_items;
create policy "CRM members can write tag items"
on public.crm_template_tag_items for insert to authenticated
with check (is_crm_member(auth.uid()));

drop policy if exists "CRM members can delete tag items" on public.crm_template_tag_items;
create policy "CRM members can delete tag items"
on public.crm_template_tag_items for delete to authenticated
using (is_crm_member(auth.uid()));

create index if not exists idx_template_tag_items_template
  on public.crm_template_tag_items (template_id, template_kind);

-- ---- 5. Personal favorites ---------------------------------------------
create table if not exists public.crm_template_favorites (
  user_id uuid not null,
  template_id uuid not null,
  template_kind text not null check (template_kind in ('email','sms')),
  created_at timestamptz not null default now(),
  primary key (user_id, template_id, template_kind)
);
alter table public.crm_template_favorites enable row level security;

drop policy if exists "Users can read own favorites" on public.crm_template_favorites;
create policy "Users can read own favorites"
on public.crm_template_favorites for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can write own favorites" on public.crm_template_favorites;
create policy "Users can write own favorites"
on public.crm_template_favorites for insert to authenticated
with check (user_id = auth.uid() and is_crm_member(auth.uid()));

drop policy if exists "Users can delete own favorites" on public.crm_template_favorites;
create policy "Users can delete own favorites"
on public.crm_template_favorites for delete to authenticated
using (user_id = auth.uid());

-- ---- 6. Featured / locked + per-agent ownership for SMS ----------------
alter table public.crm_email_templates
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_locked boolean not null default false;

alter table public.crm_sms_templates
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_locked boolean not null default false,
  add column if not exists owner_scope text not null default 'team:presale',
  add column if not exists owner_agent_slug text,
  add column if not exists created_by_agent_slug text,
  add column if not exists is_favorite_legacy boolean not null default false;

-- ---- 7. SMS log: track which template was used --------------------------
alter table public.crm_sms_log
  add column if not exists template_id uuid;
create index if not exists idx_crm_sms_log_template_id
  on public.crm_sms_log (template_id) where template_id is not null;

-- ---- 8. Stats view ------------------------------------------------------
-- Per-template aggregate: total sends, last sent, opens, clicks, replies,
-- 30-day sparkline as a JSON array of daily counts (oldest→newest).
create or replace view public.crm_template_stats as
with email_sends as (
  select
    template_id,
    count(*)::int as total_sends,
    max(sent_at) as last_sent_at,
    count(*) filter (where opened_at is not null)::int as total_opens,
    count(*) filter (where clicked_at is not null)::int as total_clicks
  from public.crm_email_send_log
  where template_id is not null
    and status = 'sent'
  group by template_id
),
email_sparkline as (
  select
    template_id,
    jsonb_agg(jsonb_build_array(d::date, c) order by d) as sparkline_30d
  from (
    select template_id, date_trunc('day', sent_at) as d, count(*) as c
    from public.crm_email_send_log
    where template_id is not null
      and sent_at >= now() - interval '30 days'
      and status = 'sent'
    group by template_id, date_trunc('day', sent_at)
  ) sub
  group by template_id
),
sms_sends as (
  select
    template_id,
    count(*)::int as total_sends,
    max(sent_at) as last_sent_at,
    count(*) filter (where status in ('delivered','sent','received'))::int as total_delivered
  from public.crm_sms_log
  where template_id is not null
  group by template_id
),
sms_sparkline as (
  select
    template_id,
    jsonb_agg(jsonb_build_array(d::date, c) order by d) as sparkline_30d
  from (
    select template_id, date_trunc('day', coalesce(sent_at, created_at)) as d, count(*) as c
    from public.crm_sms_log
    where template_id is not null
      and coalesce(sent_at, created_at) >= now() - interval '30 days'
    group by template_id, date_trunc('day', coalesce(sent_at, created_at))
  ) sub
  group by template_id
)
select
  'email'::text as template_kind,
  s.template_id,
  s.total_sends,
  s.last_sent_at,
  s.total_opens,
  s.total_clicks,
  0::int as total_replies,
  coalesce(sp.sparkline_30d, '[]'::jsonb) as sparkline_30d
from email_sends s
left join email_sparkline sp using (template_id)
union all
select
  'sms'::text as template_kind,
  s.template_id,
  s.total_sends,
  s.last_sent_at,
  s.total_delivered as total_opens,
  0::int as total_clicks,
  0::int as total_replies,
  coalesce(sp.sparkline_30d, '[]'::jsonb) as sparkline_30d
from sms_sends s
left join sms_sparkline sp using (template_id);

grant select on public.crm_template_stats to authenticated;

-- updated_at trigger for folders
create or replace function public.tg_template_folders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_template_folders_updated_at on public.crm_template_folders;
create trigger trg_template_folders_updated_at
before update on public.crm_template_folders
for each row execute function public.tg_template_folders_updated_at();