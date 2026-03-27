-- Migration: compatibilidade com schema legado de appointments.service_id
-- Date: 2026-03-27

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'service_id'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN service_id DROP NOT NULL;
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
      AND column_name = 'service_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'service_type'
  ) THEN
    ALTER TABLE public.appointments
      ADD COLUMN service_type TEXT;
  END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
