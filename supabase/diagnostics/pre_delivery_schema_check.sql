-- Auditoria de schema pre-entrega
-- Objetivo: validar se as tabelas e colunas esperadas pelo sistema existem no schema public.
-- Como usar: execute este script no SQL Editor do Supabase.

with expected_columns as (
  select *
  from (
    values
      ('plans', 'id'),
      ('plans', 'name'),
      ('plans', 'price'),
      ('plans', 'description'),
      ('plans', 'benefits'),
      ('plans', 'stripe_product_id'),
      ('plans', 'stripe_price_id'),

      ('subscriptions', 'id'),
      ('subscriptions', 'customer_email'),
      ('subscriptions', 'plan_id'),
      ('subscriptions', 'status'),
      ('subscriptions', 'stripe_subscription_id'),
      ('subscriptions', 'created_at'),

      ('barbers', 'id'),
      ('barbers', 'name'),
      ('barbers', 'specialty'),
      ('barbers', 'commission_rate'),
      ('barbers', 'phone'),
      ('barbers', 'cpf'),
      ('barbers', 'address'),
      ('barbers', 'hired_at'),
      ('barbers', 'active'),
      ('barbers', 'photo_url'),
      ('barbers', 'updated_at'),

      ('customers', 'id'),
      ('customers', 'name'),
      ('customers', 'email'),
      ('customers', 'phone'),
      ('customers', 'cpf'),
      ('customers', 'created_at'),

      ('products', 'id'),
      ('products', 'name'),
      ('products', 'cost'),
      ('products', 'price'),
      ('products', 'stock'),
      ('products', 'min_stock'),

      ('services', 'id'),
      ('services', 'barber_id'),
      ('services', 'customer_name'),
      ('services', 'service_type'),
      ('services', 'price'),
      ('services', 'commission_amount'),
      ('services', 'date'),

      ('sales', 'id'),
      ('sales', 'product_id'),
      ('sales', 'quantity'),
      ('sales', 'total_price'),
      ('sales', 'date'),

      ('appointments', 'id'),
      ('appointments', 'customer_id'),
      ('appointments', 'barber_id'),
      ('appointments', 'service_type'),
      ('appointments', 'appointment_date'),
      ('appointments', 'status'),
      ('appointments', 'created_at'),
      ('appointments', 'google_event_id'),

      ('config', 'key'),
      ('config', 'value'),

      ('expenses', 'id'),
      ('expenses', 'amount'),
      ('expenses', 'date')
  ) as t(table_name, column_name)
),
actual_columns as (
  select
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
),
missing_columns as (
  select
    e.table_name,
    e.column_name
  from expected_columns e
  left join actual_columns a
    on a.table_name = e.table_name
   and a.column_name = e.column_name
  where a.column_name is null
),
missing_tables as (
  select
    e.table_name
  from (
    select distinct table_name from expected_columns
  ) e
  left join information_schema.tables t
    on t.table_schema = 'public'
   and t.table_name = e.table_name
  where t.table_name is null
),
summary as (
  select
    (select count(*) from missing_tables) as missing_tables_count,
    (select count(*) from missing_columns) as missing_columns_count
)

select 'SUMMARY' as section, to_jsonb(summary.*) as details
from summary

union all

select 'MISSING_TABLE' as section, jsonb_build_object('table', mt.table_name) as details
from missing_tables mt

union all

select 'MISSING_COLUMN' as section,
       jsonb_build_object('table', mc.table_name, 'column', mc.column_name) as details
from missing_columns mc

union all

select 'OK_TABLE' as section,
       jsonb_build_object('table', t.table_name) as details
from (
  select distinct table_name
  from expected_columns
) t
where not exists (
  select 1
  from missing_tables mt
  where mt.table_name = t.table_name
)
order by section, details;

-- Opcional: para falhar automaticamente se houver pendencias, descomente abaixo.
-- do $$
-- declare
--   v_missing_tables int;
--   v_missing_columns int;
-- begin
--   select count(*) into v_missing_tables from (
--     select e.table_name
--     from (select distinct table_name from expected_columns) e
--     left join information_schema.tables t
--       on t.table_schema = 'public'
--      and t.table_name = e.table_name
--     where t.table_name is null
--   ) q;
--
--   select count(*) into v_missing_columns
--   from expected_columns e
--   left join information_schema.columns c
--     on c.table_schema = 'public'
--    and c.table_name = e.table_name
--    and c.column_name = e.column_name
--   where c.column_name is null;
--
--   if v_missing_tables > 0 or v_missing_columns > 0 then
--     raise exception 'Schema incompleto: % tabelas faltando e % colunas faltando', v_missing_tables, v_missing_columns;
--   end if;
-- end $$;
