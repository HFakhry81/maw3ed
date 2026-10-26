-- Phase 2: composite FKs for appointment/staff/service references.
-- Normalize empty-string FK candidates to NULL first (product allows null parents).
-- Soft refs with DEFAULT '' (appointments.category_id, staff.service_category_id) stay undocumented constraints.

UPDATE workspace_ops_appointments
SET customer_id = NULL
WHERE customer_id IS NOT NULL AND TRIM(customer_id) = '';

UPDATE workspace_ops_appointments
SET staff_id = NULL
WHERE staff_id IS NOT NULL AND TRIM(staff_id) = '';

UPDATE workspace_ops_appointments
SET service_id = NULL
WHERE service_id IS NOT NULL AND TRIM(service_id) = '';

UPDATE workspace_ops_appointments
SET checked_in_by_staff_id = NULL
WHERE checked_in_by_staff_id IS NOT NULL AND TRIM(checked_in_by_staff_id) = '';

UPDATE workspace_ops_appointment_line_items
SET service_id = NULL
WHERE service_id IS NOT NULL AND TRIM(service_id) = '';

UPDATE workspace_ops_appointment_line_items
SET added_by_staff_id = NULL
WHERE added_by_staff_id IS NOT NULL AND TRIM(added_by_staff_id) = '';

UPDATE workspace_ops_appointment_visits
SET staff_id = NULL
WHERE staff_id IS NOT NULL AND TRIM(staff_id) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointments_customer_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      ADD CONSTRAINT workspace_ops_appointments_customer_fk
      FOREIGN KEY (workspace_id, customer_id)
      REFERENCES workspace_ops_customers (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointments_staff_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      ADD CONSTRAINT workspace_ops_appointments_staff_fk
      FOREIGN KEY (workspace_id, staff_id)
      REFERENCES workspace_ops_staff (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointments_service_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      ADD CONSTRAINT workspace_ops_appointments_service_fk
      FOREIGN KEY (workspace_id, service_id)
      REFERENCES workspace_ops_services (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointments_checked_in_by_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointments
      ADD CONSTRAINT workspace_ops_appointments_checked_in_by_fk
      FOREIGN KEY (workspace_id, checked_in_by_staff_id)
      REFERENCES workspace_ops_staff (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointment_line_items_service_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointment_line_items
      ADD CONSTRAINT workspace_ops_appointment_line_items_service_fk
      FOREIGN KEY (workspace_id, service_id)
      REFERENCES workspace_ops_services (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointment_line_items_added_by_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointment_line_items
      ADD CONSTRAINT workspace_ops_appointment_line_items_added_by_fk
      FOREIGN KEY (workspace_id, added_by_staff_id)
      REFERENCES workspace_ops_staff (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_ops_appointment_visits_staff_fk'
  ) THEN
    ALTER TABLE workspace_ops_appointment_visits
      ADD CONSTRAINT workspace_ops_appointment_visits_staff_fk
      FOREIGN KEY (workspace_id, staff_id)
      REFERENCES workspace_ops_staff (workspace_id, id);
  END IF;
END $$;
