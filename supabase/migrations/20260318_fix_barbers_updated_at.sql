-- Fix for Supabase/PostgREST error:
-- Could not find the 'updated_at' column of 'barbers' in the schema cache

-- 1) Ensure column exists
alter table if exists public.barbers
  add column if not exists updated_at timestamptz default now();

-- 2) Backfill existing rows
update public.barbers
set updated_at = now()
where updated_at is null;

-- 3) Keep updated_at in sync on updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_barbers_set_updated_at on public.barbers;
create trigger trg_barbers_set_updated_at
before update on public.barbers
for each row
execute function public.set_updated_at();

-- 4) Ask PostgREST to reload schema cache
notify pgrst, 'reload schema';
