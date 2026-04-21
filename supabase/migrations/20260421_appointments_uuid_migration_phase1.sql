-- Migration: phase 1 da migracao segura de appointments legado -> uuid
-- Date: 2026-04-21
-- Observacao: em producao atual customers.id e barbers.id ainda sao inteiros.
-- Por isso as FKs canonicas desta fase apontam para customers.uuid e barbers.uuid.

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS customer_uuid uuid;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS barber_uuid uuid;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_customer_uuid
  ON public.appointments (customer_uuid);

CREATE INDEX IF NOT EXISTS idx_appointments_barber_uuid
  ON public.appointments (barber_uuid);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'customer_uuid'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'uuid'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_customer_uuid_fkey
      FOREIGN KEY (customer_uuid)
      REFERENCES public.customers(uuid)
      DEFERRABLE INITIALLY DEFERRED
      NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'barber_uuid'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'barbers'
      AND column_name = 'uuid'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_barber_uuid_fkey
      FOREIGN KEY (barber_uuid)
      REFERENCES public.barbers(uuid)
      DEFERRABLE INITIALLY DEFERRED
      NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
