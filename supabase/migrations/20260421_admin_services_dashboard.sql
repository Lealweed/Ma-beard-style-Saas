-- Migration: prepara services_catalog para o modulo admin de servicos
-- Date: 2026-04-21

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS duration_min integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'services_catalog'
  ) THEN
    UPDATE public.services_catalog
    SET category = COALESCE(NULLIF(category, ''), 'Avulso')
    WHERE category IS NULL OR category = '';

    UPDATE public.services_catalog
    SET duration_min = COALESCE(duration_min, duration_minutes, 60)
    WHERE duration_min IS NULL;

    UPDATE public.services_catalog
    SET duration_minutes = COALESCE(duration_minutes, duration_min, 60)
    WHERE duration_minutes IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_services_catalog_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.duration_min IS NULL AND NEW.duration_minutes IS NULL THEN
    NEW.duration_min := 60;
    NEW.duration_minutes := 60;
  ELSIF NEW.duration_min IS NULL THEN
    NEW.duration_min := NEW.duration_minutes;
  ELSIF NEW.duration_minutes IS NULL THEN
    NEW.duration_minutes := NEW.duration_min;
  ELSE
    NEW.duration_minutes := NEW.duration_min;
  END IF;

  NEW.category := COALESCE(NULLIF(NEW.category, ''), 'Avulso');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_catalog_admin_fields ON public.services_catalog;

CREATE TRIGGER trg_services_catalog_admin_fields
BEFORE INSERT OR UPDATE ON public.services_catalog
FOR EACH ROW
EXECUTE FUNCTION public.sync_services_catalog_admin_fields();

CREATE INDEX IF NOT EXISTS idx_services_catalog_active_name
  ON public.services_catalog (active, name);
