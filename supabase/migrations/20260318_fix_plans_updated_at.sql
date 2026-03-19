-- Fix para erro de schema cache em plans.updated_at

alter table if exists public.plans
  add column if not exists updated_at timestamptz default now();

update public.plans
set updated_at = now()
where updated_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plans_set_updated_at on public.plans;
create trigger trg_plans_set_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
