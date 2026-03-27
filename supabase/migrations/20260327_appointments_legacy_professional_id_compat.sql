-- Migration: compatibilidade com schema legado de appointments.professional_id
-- Date: 2026-03-27

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'professional_id'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN professional_id DROP NOT NULL;
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
      AND column_name = 'professional_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'barber_id'
  ) THEN
    ALTER TABLE public.appointments
      ADD COLUMN barber_id INTEGER;
  END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
DECLARE
  professional_id_type TEXT;
  barber_id_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'professional_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'barber_id'
  ) THEN
    SELECT udt_name
    INTO professional_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'professional_id';

    SELECT udt_name
    INTO barber_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'barber_id';

    IF professional_id_type = barber_id_type THEN
      UPDATE public.appointments
      SET barber_id = COALESCE(barber_id, professional_id),
          professional_id = COALESCE(professional_id, barber_id)
      WHERE barber_id IS NULL OR professional_id IS NULL;
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
      AND column_name = 'barber_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'barbers'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_barber_id_fkey
      FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
