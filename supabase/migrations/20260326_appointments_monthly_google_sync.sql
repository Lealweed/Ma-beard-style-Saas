-- Migration: suporte a agenda mensal e sincronizacao bidirecional com Google Calendar
-- Date: 2026-03-26

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN appointment_end TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN sync_origin TEXT NOT NULL DEFAULT 'local';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN google_calendar_id TEXT DEFAULT 'primary';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN google_last_modified TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE appointments ADD COLUMN sync_last_synced_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE appointments
SET appointment_end = appointment_date + INTERVAL '60 minutes'
WHERE appointment_end IS NULL;

DO $$ BEGIN
  ALTER TABLE appointments
    ADD CONSTRAINT appointments_sync_origin_check
    CHECK (sync_origin IN ('local', 'google'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_month_range
  ON appointments (appointment_date, appointment_end);

CREATE INDEX IF NOT EXISTS idx_appointments_google_sync_origin
  ON appointments (sync_origin, google_event_id);
