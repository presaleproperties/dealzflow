alter view public.crm_template_stats set (security_invoker = on);

create or replace function public.tg_template_folders_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end $$;