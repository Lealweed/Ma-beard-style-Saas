-- Migration: P0 hardening de seguranca, RLS e schema drift critico
-- Date: 2026-04-21

ALTER TABLE IF EXISTS public.services_catalog
  ADD COLUMN IF NOT EXISTS category text;

CREATE OR REPLACE FUNCTION public.jwt_is_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND COALESCE(
      lower(auth.jwt() -> 'app_metadata' ->> 'role'),
      lower(auth.jwt() -> 'user_metadata' ->> 'role'),
      ''
    ) = ANY (ARRAY['admin', 'owner', 'superadmin']);
$$;

DO $$
DECLARE
  target_table text;
  policy_record record;
  target_tables text[] := ARRAY[
    'config',
    'customers',
    'appointments',
    'sales',
    'expenses',
    'services',
    'services_catalog',
    'products',
    'stock_movements',
    'subscriptions',
    'plans',
    'barbers'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = target_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_table);
      END LOOP;

      EXECUTE format('REVOKE ALL ON public.%I FROM anon', target_table);
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', target_table);
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', target_table);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', target_table);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', target_table);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  target_table text;
  sequence_name text;
  target_tables text[] := ARRAY[
    'customers',
    'appointments',
    'sales',
    'expenses',
    'services',
    'services_catalog',
    'products',
    'stock_movements',
    'barbers'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    SELECT pg_get_serial_sequence(format('public.%I', target_table), 'id')
    INTO sequence_name;

    IF sequence_name IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon', sequence_name);
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', sequence_name);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', sequence_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'config'
  ) THEN
    CREATE POLICY p0_config_admin_full
      ON public.config
      FOR ALL
      TO authenticated
      USING (public.jwt_is_admin_role())
      WITH CHECK (public.jwt_is_admin_role());
  END IF;
END $$;

DO $$
DECLARE
  target_table text;
  target_tables text[] := ARRAY[
    'customers',
    'appointments',
    'sales',
    'expenses',
    'services',
    'services_catalog',
    'products',
    'stock_movements',
    'subscriptions',
    'plans',
    'barbers'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = target_table
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.jwt_is_admin_role()) WITH CHECK (public.jwt_is_admin_role())',
        'p0_' || target_table || '_admin_full',
        target_table
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  policy_record record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
  ) THEN
    FOR policy_record IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND (
          policyname IN (
            'p0_videos_admin_select',
            'p0_videos_admin_insert',
            'p0_videos_admin_update',
            'p0_videos_admin_delete'
          )
          OR coalesce(qual, '') ILIKE '%bucket_id = ''videos''%'
          OR coalesce(with_check, '') ILIKE '%bucket_id = ''videos''%'
          OR coalesce(qual, '') ILIKE '%bucket_id=''videos''%'
          OR coalesce(with_check, '') ILIKE '%bucket_id=''videos''%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
    END LOOP;

    CREATE POLICY p0_videos_admin_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'videos' AND public.jwt_is_admin_role());

    CREATE POLICY p0_videos_admin_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'videos' AND public.jwt_is_admin_role());

    CREATE POLICY p0_videos_admin_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'videos' AND public.jwt_is_admin_role())
      WITH CHECK (bucket_id = 'videos' AND public.jwt_is_admin_role());

    CREATE POLICY p0_videos_admin_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'videos' AND public.jwt_is_admin_role());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
  ) THEN
    UPDATE storage.buckets
    SET public = false
    WHERE id = 'videos'
      AND public IS DISTINCT FROM false;
  END IF;
END $$;