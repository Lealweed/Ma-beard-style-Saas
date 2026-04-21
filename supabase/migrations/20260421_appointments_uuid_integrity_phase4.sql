-- Migration: phase 4 integridade progressiva para uuid em appointments
-- Date: 2026-04-21

CREATE OR REPLACE FUNCTION public.validate_confirmed_appointment_uuid_links_progressive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_service_type text := lower(coalesce(NEW.service_type, ''));
  requires_uuid boolean := false;
BEGIN
  requires_uuid :=
    NEW.status = 'confirmed'
    AND coalesce(NEW.sync_origin, 'local') = 'local'
    AND normalized_service_type NOT LIKE '%bloque%'
    AND normalized_service_type NOT LIKE '%indispon%'
    AND (
      TG_OP = 'INSERT'
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.customer_uuid IS DISTINCT FROM OLD.customer_uuid
      OR NEW.barber_uuid IS DISTINCT FROM OLD.barber_uuid
    );

  IF requires_uuid THEN
    IF NEW.customer_uuid IS NULL THEN
      RAISE EXCEPTION 'customer_uuid obrigatorio para appointments confirmados no novo fluxo';
    END IF;

    IF NEW.barber_uuid IS NULL THEN
      RAISE EXCEPTION 'barber_uuid obrigatorio para appointments confirmados no novo fluxo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_confirmed_appointment_uuid_links_progressive_on_write ON public.appointments;

CREATE TRIGGER validate_confirmed_appointment_uuid_links_progressive_on_write
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.validate_confirmed_appointment_uuid_links_progressive();
