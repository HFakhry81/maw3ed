-- Unified multi-purpose status machines for Maw3ed.
-- BookingType vocabulary (APPOINTMENT | RESOURCE_RENTAL | BATCH_SCHEDULE) maps to
-- occupancy_mode (exclusive | rental | session_capacity). This migration widens
-- CHECK constraints so desk flows for medical, education, salon, and rental work.

-- Appointment lifecycle: booking + visit/session on the same status column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointments_status_check'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      DROP CONSTRAINT workspace_ops_appointments_status_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE workspace_ops_appointments
    ADD CONSTRAINT workspace_ops_appointments_status_check
    CHECK (status IN (
      'pending', 'confirmed', 'waitlisted', 'rescheduled',
      'checked_in', 'in_progress', 'paused', 'completed',
      'cancelled', 'no_show'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- Resources: available / occupied / reserved / under_maintenance (+ legacy).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_resources_status_check'
  ) THEN
    ALTER TABLE workspace_ops_resources DROP CONSTRAINT workspace_ops_resources_status_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE workspace_ops_resources
    ADD CONSTRAINT workspace_ops_resources_status_check
    CHECK (status IN (
      'available', 'occupied', 'reserved', 'under_maintenance',
      'active', 'inactive', 'maintenance'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

UPDATE workspace_ops_resources
SET status = CASE status
  WHEN 'active' THEN 'available'
  WHEN 'inactive' THEN 'under_maintenance'
  WHEN 'maintenance' THEN 'under_maintenance'
  ELSE status
END
WHERE status IN ('active', 'inactive', 'maintenance');

-- Batch / class occurrence: open / full / cancelled (+ legacy scheduled/completed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_ops_session_occurrences_status_check'
  ) THEN
    ALTER TABLE workspace_ops_session_occurrences
      DROP CONSTRAINT workspace_ops_session_occurrences_status_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE workspace_ops_session_occurrences
    ADD CONSTRAINT workspace_ops_session_occurrences_status_check
    CHECK (status IN ('open', 'full', 'cancelled', 'scheduled', 'completed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

UPDATE workspace_ops_session_occurrences
SET status = 'open'
WHERE status = 'scheduled';

-- Attendance: attended / absent / excused (+ present/late aliases retained).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_ops_attendance_records_status_check'
  ) THEN
    ALTER TABLE workspace_ops_attendance_records
      DROP CONSTRAINT workspace_ops_attendance_records_status_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE workspace_ops_attendance_records
    ADD CONSTRAINT workspace_ops_attendance_records_status_check
    CHECK (status IN ('attended', 'absent', 'excused', 'present', 'late'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- Optional rental session overlay on appointments (RESOURCE_RENTAL live tabs).
ALTER TABLE workspace_ops_appointments
  ADD COLUMN IF NOT EXISTS rental_session_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_ops_appointments_rental_session_status_check'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      ADD CONSTRAINT workspace_ops_appointments_rental_session_status_check
      CHECK (
        rental_session_status IS NULL
        OR rental_session_status IN (
          'open', 'fixed_time', 'paused',
          'closed_pending_payment', 'settled', 'cancelled'
        )
      );
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
