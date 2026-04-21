-- Diagnostico e cobertura da migracao appointments -> uuid
-- Date: 2026-04-21

WITH totals AS (
  SELECT count(*)::bigint AS total_appointments
  FROM public.appointments
),
customer_coverage AS (
  SELECT
    count(*) FILTER (WHERE a.customer_id IS NOT NULL AND c.id IS NOT NULL)::bigint AS customer_legacy_mappable,
    count(*) FILTER (WHERE a.customer_uuid IS NOT NULL)::bigint AS customer_uuid_filled,
    count(*) FILTER (WHERE a.customer_id IS NULL)::bigint AS customer_legacy_null,
    count(*) FILTER (WHERE a.customer_id IS NOT NULL AND c.id IS NULL)::bigint AS customer_legacy_missing
  FROM public.appointments a
  LEFT JOIN public.customers c ON c.id = a.customer_id
),
barber_coverage AS (
  SELECT
    count(*) FILTER (WHERE a.barber_id IS NOT NULL AND b.id IS NOT NULL)::bigint AS barber_legacy_mappable,
    count(*) FILTER (WHERE a.barber_uuid IS NOT NULL)::bigint AS barber_uuid_filled,
    count(*) FILTER (WHERE a.barber_id IS NULL)::bigint AS barber_legacy_null,
    count(*) FILTER (WHERE a.barber_id IS NOT NULL AND b.id IS NULL)::bigint AS barber_legacy_missing
  FROM public.appointments a
  LEFT JOIN public.barbers b ON b.id = a.barber_id
)
SELECT
  t.total_appointments,
  cc.customer_legacy_mappable,
  cc.customer_uuid_filled,
  cc.customer_legacy_null,
  cc.customer_legacy_missing,
  bc.barber_legacy_mappable,
  bc.barber_uuid_filled,
  bc.barber_legacy_null,
  bc.barber_legacy_missing,
  round((cc.customer_legacy_mappable::numeric / NULLIF(t.total_appointments, 0)) * 100, 2) AS customer_mappable_pct,
  round((bc.barber_legacy_mappable::numeric / NULLIF(t.total_appointments, 0)) * 100, 2) AS barber_mappable_pct,
  round((cc.customer_uuid_filled::numeric / NULLIF(t.total_appointments, 0)) * 100, 2) AS customer_uuid_filled_pct,
  round((bc.barber_uuid_filled::numeric / NULLIF(t.total_appointments, 0)) * 100, 2) AS barber_uuid_filled_pct
FROM totals t
CROSS JOIN customer_coverage cc
CROSS JOIN barber_coverage bc;

select id, customer_id, customer_uuid, barber_id, barber_uuid, status, created_at
from public.appointments
order by created_at desc
limit 20;
