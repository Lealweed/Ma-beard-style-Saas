-- Migration: compatibilidade com schema legado de appointments.starts_at/ends_at
-- Date: 2026-03-27

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'starts_at'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN starts_at DROP NOT NULL;
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
      AND column_name = 'ends_at'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN ends_at DROP NOT NULL;
  END IF;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$
DECLARE
  starts_at_type TEXT;
  appointment_date_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'starts_at'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'appointment_date'
  ) THEN
    SELECT udt_name
    INTO starts_at_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'starts_at';

    SELECT udt_name
    INTO appointment_date_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'appointment_date';

    IF starts_at_type = appointment_date_type THEN
      UPDATE public.appointments
      SET starts_at = COALESCE(starts_at, appointment_date)
      WHERE starts_at IS NULL;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  ends_at_type TEXT;
  appointment_end_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'ends_at'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'appointment_end'
  ) THEN
    SELECT udt_name
    INTO ends_at_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'ends_at';

    SELECT udt_name
    INTO appointment_end_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'appointment_end';

    IF ends_at_type = appointment_end_type THEN
      UPDATE public.appointments
      SET ends_at = COALESCE(ends_at, appointment_end)
      WHERE ends_at IS NULL;
    END IF;
  END IF;
END $$;
