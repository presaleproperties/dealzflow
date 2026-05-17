-- Autonomy & voice toggle on zara_settings (singleton-ish per workspace)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='zara_settings' and column_name='autonomy_level') then
    alter table public.zara_settings add column autonomy_level int not null default 3 check (autonomy_level between 1 and 5);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='zara_settings' and column_name='voice_enabled') then
    alter table public.zara_settings add column voice_enabled boolean not null default false;
  end if;
end $$;

-- Single rolling chat per agent
create table if not exists public.zara_chat_messages (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null,
  role text not null check (role in ('user','assistant','system','tool')),
  parts jsonb not null,
  pinned_contact_id uuid references public.crm_contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.zara_chat_messages enable row level security;

drop policy if exists "zara_chat_own_select" on public.zara_chat_messages;
drop policy if exists "zara_chat_own_insert" on public.zara_chat_messages;
drop policy if exists "zara_chat_own_delete" on public.zara_chat_messages;

create policy "zara_chat_own_select" on public.zara_chat_messages
  for select using (auth.uid() = agent_user_id);
create policy "zara_chat_own_insert" on public.zara_chat_messages
  for insert with check (auth.uid() = agent_user_id);
create policy "zara_chat_own_delete" on public.zara_chat_messages
  for delete using (auth.uid() = agent_user_id);

create index if not exists zara_chat_messages_agent_created_idx
  on public.zara_chat_messages (agent_user_id, created_at desc);