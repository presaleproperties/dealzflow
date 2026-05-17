create table if not exists public.zara_pending_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zara_conversations(id) on delete cascade,
  message_id uuid references public.zara_messages(id) on delete set null,
  tool_use_id text not null,
  tool_name text not null,
  tool_input jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  result jsonb,
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists zara_pending_tool_calls_conv_idx on public.zara_pending_tool_calls(conversation_id, created_at desc);
create unique index if not exists zara_pending_tool_calls_use_idx on public.zara_pending_tool_calls(tool_use_id);

alter table public.zara_pending_tool_calls enable row level security;

create policy "owners read own pending tool calls"
on public.zara_pending_tool_calls for select
using (requested_by = auth.uid());

create policy "owners insert own pending tool calls"
on public.zara_pending_tool_calls for insert
with check (requested_by = auth.uid());

create policy "owners update own pending tool calls"
on public.zara_pending_tool_calls for update
using (requested_by = auth.uid())
with check (requested_by = auth.uid());