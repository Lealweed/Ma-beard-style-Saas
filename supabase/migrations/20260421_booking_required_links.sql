-- Migration: booking publico com vinculos obrigatorios em appointments
-- Date: 2026-04-21

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS service_id INTEGER;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'service_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'services_catalog'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services_catalog(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validate_confirmed_appointment_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    IF NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id obrigatorio para appointments confirmados';
    END IF;

    IF NEW.barber_id IS NULL THEN
      RAISE EXCEPTION 'barber_id obrigatorio para appointments confirmados';
    END IF;

    IF NEW.service_id IS NULL THEN
      RAISE EXCEPTION 'service_id obrigatorio para appointments confirmados';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_confirmed_appointment_links_on_write ON public.appointments;

CREATE TRIGGER validate_confirmed_appointment_links_on_write
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.validate_confirmed_appointment_links();