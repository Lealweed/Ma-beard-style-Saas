-- Migration: core hibrido de clientes e agendamentos (Fase 1 + Fase 2)
-- Date: 2026-04-21

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'non_subscriber';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date DATE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferences TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_url TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_tag TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers
    ADD CONSTRAINT customers_customer_type_check
    CHECK (customer_type IN ('subscriber', 'non_subscriber'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers
    ADD CONSTRAINT customers_status_check
    CHECK (status IN ('active', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(10,2) NOT NULL DEFAULT 0;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'service_charge';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS customer_type_snapshot TEXT NOT NULL DEFAULT 'non_subscriber';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_pricing_mode_check
    CHECK (pricing_mode IN ('plan_covered', 'service_charge', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_customer_type_snapshot_check
    CHECK (customer_type_snapshot IN ('subscriber', 'non_subscriber'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.customers c
SET customer_type = 'subscriber'
WHERE EXISTS (
  SELECT 1
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND lower(coalesce(s.customer_email, '')) = lower(coalesce(c.email, ''))
)
  AND c.customer_type IS DISTINCT FROM 'subscriber';

CREATE INDEX IF NOT EXISTS customers_customer_type_idx
  ON public.customers (customer_type);

CREATE INDEX IF NOT EXISTS customers_status_idx
  ON public.customers (status);

CREATE INDEX IF NOT EXISTS appointments_service_id_idx
  ON public.appointments (service_id)
  WHERE service_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_confirmed_appointment_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_service_type text := lower(coalesce(NEW.service_type, ''));
BEGIN
  IF NEW.status = 'confirmed'
    AND normalized_service_type NOT LIKE '%bloque%'
    AND normalized_service_type NOT LIKE '%indispon%'
  THEN
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