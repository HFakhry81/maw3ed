CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES app_users(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'medical',
  locale TEXT NOT NULL DEFAULT 'ar',
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS plan_catalog (
  plan_key TEXT PRIMARY KEY CHECK (plan_key IN ('free', 'pro', 'ultimate')),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
  billing_period_days INTEGER NOT NULL DEFAULT 30,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  whop_product_id TEXT,
  whop_plan_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL REFERENCES plan_catalog(plan_key),
  provider TEXT NOT NULL DEFAULT 'whop',
  provider_plan_id TEXT,
  provider_membership_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS active_workspace_subscription_idx
  ON workspace_subscriptions (workspace_id)
  WHERE status IN ('pending', 'active', 'past_due');

CREATE TABLE IF NOT EXISTS usage_counters (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  bookings_count INTEGER NOT NULL DEFAULT 0,
  team_members_count INTEGER NOT NULL DEFAULT 0,
  customers_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, period_start)
);

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES app_users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plan_catalog (plan_key, display_name, description, price_usd, billing_period_days, features, limits, whop_product_id, whop_plan_id)
VALUES
  ('free', 'Free', 'لبدء النشاط وتجربة النواة الأساسية', 0, 30,
   '{"public_booking":true,"basic_dashboard":true,"email_verification":true,"analytics":false,"reminders":false,"custom_branding":false,"api_access":false}'::jsonb,
   '{"team_members":1,"services":5,"bookings_per_month":100,"locations":1}'::jsonb, NULL, NULL),
  ('pro', 'Pro', 'للنشاطات النامية والفرق الصغيرة', 9.99, 30,
   '{"public_booking":true,"basic_dashboard":true,"email_verification":true,"analytics":true,"reminders":true,"custom_branding":true,"api_access":false}'::jsonb,
   '{"team_members":10,"services":50,"bookings_per_month":1000,"locations":3}'::jsonb, 'prod_RGUV99s3OXK0h', 'plan_Z8iEl4EpfUXes'),
  ('ultimate', 'Ultimate', 'للمؤسسات والفرق متعددة العمليات', 29.99, 30,
   '{"public_booking":true,"basic_dashboard":true,"email_verification":true,"analytics":true,"reminders":true,"custom_branding":true,"api_access":true,"priority_support":true,"advanced_roles":true}'::jsonb,
   '{"team_members":-1,"services":-1,"bookings_per_month":-1,"locations":-1}'::jsonb, 'prod_Yj3Domdod1ykr', 'plan_k1v2fd3lVUZjz')
ON CONFLICT (plan_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_usd = EXCLUDED.price_usd,
  billing_period_days = EXCLUDED.billing_period_days,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  whop_product_id = COALESCE(EXCLUDED.whop_product_id, plan_catalog.whop_product_id),
  whop_plan_id = COALESCE(EXCLUDED.whop_plan_id, plan_catalog.whop_plan_id),
  updated_at = NOW();