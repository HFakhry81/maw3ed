-- Durable public booking slot holds (multi-worker safe)
CREATE TABLE IF NOT EXISTS slot_holds (
  hold_key TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  hold_date DATE NOT NULL,
  hold_time TIME NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS slot_holds_lookup_idx
  ON slot_holds (staff_id, hold_date, expires_at);

CREATE INDEX IF NOT EXISTS slot_holds_expires_idx
  ON slot_holds (expires_at);
