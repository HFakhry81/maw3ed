-- Phase 4 package 1: generic resources + occupancy modes + session capacity.
-- occupancy_mode is explicit on services — never inferred from activity_mode/template.
-- Capacity unit is explicit on resources (seat|unit); do not treat resource count as seats
-- unless unit='seat'.

ALTER TABLE workspace_ops_services
  ADD COLUMN IF NOT EXISTS occupancy_mode TEXT NOT NULL DEFAULT 'exclusive';

ALTER TABLE workspace_ops_services
  ADD COLUMN IF NOT EXISTS default_capacity INTEGER NOT NULL DEFAULT 1;

ALTER TABLE workspace_ops_services
  ADD COLUMN IF NOT EXISTS composition_default TEXT NOT NULL DEFAULT 'single';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_services_occupancy_mode_check'
  ) THEN
    ALTER TABLE workspace_ops_services
      ADD CONSTRAINT workspace_ops_services_occupancy_mode_check
      CHECK (occupancy_mode IN ('exclusive', 'rental', 'session_capacity'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_services_composition_default_check'
  ) THEN
    ALTER TABLE workspace_ops_services
      ADD CONSTRAINT workspace_ops_services_composition_default_check
      CHECK (composition_default IN ('single', 'bundle'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_services_default_capacity_check'
  ) THEN
    ALTER TABLE workspace_ops_services
      ADD CONSTRAINT workspace_ops_services_default_capacity_check
      CHECK (default_capacity >= 1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workspace_ops_resources (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'room'
    CHECK (resource_type IN ('room', 'chair', 'device', 'table', 'other')),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  unit TEXT NOT NULL DEFAULT 'seat' CHECK (unit IN ('seat', 'unit')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  location TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS workspace_ops_resources_type_idx
  ON workspace_ops_resources (workspace_id, resource_type, status);

CREATE TABLE IF NOT EXISTS workspace_ops_service_resource_requirements (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  resource_id TEXT,
  resource_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, service_id)
    REFERENCES workspace_ops_services(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, resource_id)
    REFERENCES workspace_ops_resources(workspace_id, id) ON DELETE CASCADE,
  CHECK (resource_id IS NOT NULL OR resource_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS workspace_ops_service_resource_req_service_idx
  ON workspace_ops_service_resource_requirements (workspace_id, service_id);

CREATE TABLE IF NOT EXISTS workspace_ops_session_series (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  staff_id TEXT,
  resource_id TEXT,
  default_capacity INTEGER NOT NULL DEFAULT 1 CHECK (default_capacity >= 1),
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, service_id)
    REFERENCES workspace_ops_services(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id, resource_id)
    REFERENCES workspace_ops_resources(workspace_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workspace_ops_session_occurrences (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  series_id TEXT,
  staff_id TEXT,
  resource_id TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, service_id)
    REFERENCES workspace_ops_services(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, series_id)
    REFERENCES workspace_ops_session_series(workspace_id, id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id, resource_id)
    REFERENCES workspace_ops_resources(workspace_id, id) ON DELETE SET NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS workspace_ops_session_occurrences_time_idx
  ON workspace_ops_session_occurrences (workspace_id, starts_at, ends_at)
  WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS workspace_ops_session_enrollments (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 1 CHECK (seats >= 1),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'attended', 'no_show')),
  idempotency_key TEXT NOT NULL DEFAULT '',
  booking_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, occurrence_id)
    REFERENCES workspace_ops_session_occurrences(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, customer_id)
    REFERENCES workspace_ops_customers(workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_ops_session_enrollments_active_customer_uidx
  ON workspace_ops_session_enrollments (workspace_id, occurrence_id, customer_id)
  WHERE status IN ('reserved', 'confirmed', 'attended');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_ops_session_enrollments_idempotency_uidx
  ON workspace_ops_session_enrollments (workspace_id, idempotency_key)
  WHERE idempotency_key <> '';

CREATE INDEX IF NOT EXISTS workspace_ops_session_enrollments_occurrence_idx
  ON workspace_ops_session_enrollments (workspace_id, occurrence_id, status);

CREATE TABLE IF NOT EXISTS workspace_ops_attendance_records (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'late', 'excused')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, occurrence_id, enrollment_id),
  FOREIGN KEY (workspace_id, occurrence_id)
    REFERENCES workspace_ops_session_occurrences(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, enrollment_id)
    REFERENCES workspace_ops_session_enrollments(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_resource_allocations (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  booking_id TEXT,
  line_item_id TEXT,
  occurrence_id TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, resource_id)
    REFERENCES workspace_ops_resources(workspace_id, id) ON DELETE CASCADE,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS workspace_ops_resource_allocations_resource_time_idx
  ON workspace_ops_resource_allocations (workspace_id, resource_id, starts_at, ends_at)
  WHERE status = 'active';
