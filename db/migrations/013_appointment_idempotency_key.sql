-- Phase 3: durable idempotency key for workspace_ops appointments (JSON↔PG parity).
-- Empty string means "no key". Partial unique index prevents double-commit on retry.

ALTER TABLE workspace_ops_appointments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS workspace_ops_appointments_idempotency_uidx
  ON workspace_ops_appointments (workspace_id, idempotency_key)
  WHERE idempotency_key <> '';
