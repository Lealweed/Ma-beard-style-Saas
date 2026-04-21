-- Migration: prepara UUID canonico em customers/barbers para migracao segura de appointments
-- Date: 2026-04-21

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS uuid uuid;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.barbers
    ADD COLUMN IF NOT EXISTS uuid uuid;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

UPDATE public.customers
SET uuid = gen_random_uuid()
WHERE uuid IS NULL;

UPDATE public.barbers
SET uuid = gen_random_uuid()
WHERE uuid IS NULL;

DO $$ BEGIN
  ALTER TABLE public.customers
    ALTER COLUMN uuid SET DEFAULT gen_random_uuid();
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.barbers
    ALTER COLUMN uuid SET DEFAULT gen_random_uuid();
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_uuid_unique
  ON public.customers (uuid)
  WHERE uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_barbers_uuid_unique
  ON public.barbers (uuid)
  WHERE uuid IS NOT NULL;
