-- Migration: compatibilidade com schema legado de appointments.client_id
-- Date: 2026-03-27

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN client_id DROP NOT NULL;
  END IF;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'client_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.appointments
      ADD COLUMN customer_id INTEGER;
  END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
DECLARE
  client_id_type TEXT;
  customer_id_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'client_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'customer_id'
  ) THEN
    SELECT udt_name
    INTO client_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'client_id';

    SELECT udt_name
    INTO customer_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'customer_id';

    IF client_id_type = customer_id_type THEN
      UPDATE public.appointments
      SET customer_id = COALESCE(customer_id, client_id),
          client_id = COALESCE(client_id, customer_id)
      WHERE customer_id IS NULL OR client_id IS NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'customer_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
