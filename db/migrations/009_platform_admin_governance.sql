-- Platform Super Admin governance: RBAC, immutable audit, billing ledger, confirmations

-- 1) RBAC on app_users
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS platform_role TEXT
  CHECK (platform_role IS NULL OR platform_role IN ('super_admin', 'financial_admin', 'support_admin'));

UPDATE app_users
SET platform_role = 'super_admin',
    updated_at = NOW()
WHERE is_platform_admin = TRUE
  AND platform_role IS NULL;

UPDATE app_users
SET is_platform_admin = TRUE,
    updated_at = NOW()
WHERE platform_role IS NOT NULL
  AND is_platform_admin = FALSE;

-- Keep is_platform_admin in sync when platform_role changes
CREATE OR REPLACE FUNCTION sync_app_user_platform_admin()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_platform_admin := (NEW.platform_role IS NOT NULL);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_app_user_platform_admin ON app_users;
CREATE TRIGGER trg_sync_app_user_platform_admin
  BEFORE INSERT OR UPDATE OF platform_role ON app_users
  FOR EACH ROW
  EXECUTE PROCEDURE sync_app_user_platform_admin();

-- 2) Immutable audit enrichment
ALTER TABLE platform_audit_events
  ADD COLUMN IF NOT EXISTS old_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE OR REPLACE FUNCTION prevent_platform_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_events are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_audit_no_update ON platform_audit_events;
CREATE TRIGGER trg_platform_audit_no_update
  BEFORE UPDATE ON platform_audit_events
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_platform_audit_mutation();

DROP TRIGGER IF EXISTS trg_platform_audit_no_delete ON platform_audit_events;
CREATE TRIGGER trg_platform_audit_no_delete
  BEFORE DELETE ON platform_audit_events
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_platform_audit_mutation();

-- 3) Subscription lifecycle snapshots
ALTER TABLE workspace_subscriptions
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_usd_snapshot NUMERIC(10, 2);

-- 4) SaaS billing ledger
CREATE TABLE IF NOT EXISTS billing_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES workspace_subscriptions(id) ON DELETE SET NULL,
  plan_key TEXT REFERENCES plan_catalog(plan_key),
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'whop', 'internal', 'stripe')),
  provider_payment_id TEXT,
  direction TEXT NOT NULL DEFAULT 'in'
    CHECK (direction IN ('in', 'out', 'adjustment')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'void')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_transactions_workspace_idx
  ON billing_transactions (workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS billing_transactions_status_idx
  ON billing_transactions (status, occurred_at DESC);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES workspace_subscriptions(id) ON DELETE SET NULL,
  plan_key TEXT NOT NULL REFERENCES plan_catalog(plan_key),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  amount_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_invoices_workspace_idx
  ON subscription_invoices (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_settlements (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_settlement_id TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Double-confirm tokens for destructive admin actions
CREATE TABLE IF NOT EXISTS admin_action_confirmations (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_action_confirmations_admin_idx
  ON admin_action_confirmations (admin_id, created_at DESC);
