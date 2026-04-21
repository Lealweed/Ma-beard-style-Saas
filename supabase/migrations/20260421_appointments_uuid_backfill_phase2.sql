-- Migration: phase 2 backfill controlado de appointments.customer_uuid/barber_uuid
-- Date: 2026-04-21

DO $$
DECLARE
  batch_size integer := 1000;
  rows_updated integer := 0;
  total_customer_rows integer := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT a.ctid, c.uuid AS mapped_uuid
      FROM public.appointments a
      JOIN public.customers c ON c.id = a.customer_id
      WHERE a.customer_id IS NOT NULL
        AND a.customer_uuid IS NULL
        AND c.uuid IS NOT NULL
      LIMIT batch_size
    )
    UPDATE public.appointments a
    SET customer_uuid = batch.mapped_uuid
    FROM batch
    WHERE a.ctid = batch.ctid;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_customer_rows := total_customer_rows + rows_updated;
    EXIT WHEN rows_updated = 0;
    RAISE NOTICE 'appointments.customer_uuid backfill: % rows atualizados', total_customer_rows;
  END LOOP;
END $$;

DO $$
DECLARE
  batch_size integer := 1000;
  rows_updated integer := 0;
  total_barber_rows integer := 0;
BEGIN
  LOOP
    WITH batch AS (
      SELECT a.ctid, b.uuid AS mapped_uuid
      FROM public.appointments a
      JOIN public.barbers b ON b.id = a.barber_id
      WHERE a.barber_id IS NOT NULL
        AND a.barber_uuid IS NULL
        AND b.uuid IS NOT NULL
      LIMIT batch_size
    )
    UPDATE public.appointments a
    SET barber_uuid = batch.mapped_uuid
    FROM batch
    WHERE a.ctid = batch.ctid;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_barber_rows := total_barber_rows + rows_updated;
    EXIT WHEN rows_updated = 0;
    RAISE NOTICE 'appointments.barber_uuid backfill: % rows atualizados', total_barber_rows;
  END LOOP;
END $$;
