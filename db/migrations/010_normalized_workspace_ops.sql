CREATE TABLE IF NOT EXISTS workspace_ops_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL DEFAULT '',
  industry TEXT,
  email TEXT,
  phone TEXT,
  description TEXT,
  country TEXT,
  state TEXT,
  city TEXT,
  street TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  online_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  logo_url TEXT NOT NULL DEFAULT '',
  show_platform_branding BOOLEAN NOT NULL DEFAULT TRUE,
  locale TEXT NOT NULL DEFAULT 'ar',
  calendar_show_business_hours_only BOOLEAN NOT NULL DEFAULT TRUE,
  calendar_slot_order TEXT NOT NULL DEFAULT 'start-to-end',
  calendar_appointment_color_mode TEXT NOT NULL DEFAULT 'service',
  calendar_multi_service_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_email_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  notification_email_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  notification_email_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  notification_email_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
  notification_email_reschedule BOOLEAN NOT NULL DEFAULT TRUE,
  notification_messaging_channel TEXT NOT NULL DEFAULT 'whatsapp',
  notification_messaging_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  notification_messaging_reminder BOOLEAN NOT NULL DEFAULT FALSE,
  notification_messaging_cancellation BOOLEAN NOT NULL DEFAULT FALSE,
  notification_messaging_reschedule BOOLEAN NOT NULL DEFAULT FALSE,
  notification_push_daily_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  activity_mode TEXT NOT NULL DEFAULT 'medical',
  activity_mode_locked BOOLEAN NOT NULL DEFAULT FALSE,
  activity_template_id TEXT NOT NULL DEFAULT 'medical',
  plan_key TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_ops_social_links (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, platform)
);

CREATE TABLE IF NOT EXISTS workspace_ops_activity_labels (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('default', 'localized')),
  locale TEXT NOT NULL,
  label_key TEXT NOT NULL,
  label_value TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope, locale, label_key)
);

CREATE TABLE IF NOT EXISTS workspace_ops_medical_departments (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_customer_categories (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2474df',
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_customers (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT 'cat-new',
  avatar_url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, category_id)
    REFERENCES workspace_ops_customer_categories(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS workspace_ops_customers_search_idx
  ON workspace_ops_customers (workspace_id, phone, email);

CREATE TABLE IF NOT EXISTS workspace_ops_service_categories (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_staff (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  service_place TEXT NOT NULL DEFAULT '',
  service_category_id TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  use_business_hours BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_staff_working_hours (
  workspace_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  opens_at TEXT NOT NULL DEFAULT '09:00',
  closes_at TEXT NOT NULL DEFAULT '17:00',
  overnight BOOLEAN NOT NULL DEFAULT FALSE,
  break_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  break_starts_at TEXT NOT NULL DEFAULT '',
  break_ends_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, staff_id, weekday),
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_staff_closed_days (
  workspace_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, staff_id, id),
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_staff_specific_days (
  workspace_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  opens_at TEXT NOT NULL DEFAULT '08:00',
  closes_at TEXT NOT NULL DEFAULT '16:00',
  break_starts_at TEXT NOT NULL DEFAULT '',
  break_ends_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, staff_id, id),
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_services (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  pricing_type TEXT NOT NULL DEFAULT 'fixed',
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_min NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_max NUMERIC(12, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#2474df',
  public_booking BOOLEAN NOT NULL DEFAULT TRUE,
  auto_accept BOOLEAN NOT NULL DEFAULT FALSE,
  auto_complete BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, category_id)
    REFERENCES workspace_ops_service_categories(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS workspace_ops_services_category_idx
  ON workspace_ops_services (workspace_id, category_id, active);

CREATE TABLE IF NOT EXISTS workspace_ops_service_providers (
  workspace_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, service_id, staff_id),
  FOREIGN KEY (workspace_id, service_id)
    REFERENCES workspace_ops_services(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, staff_id)
    REFERENCES workspace_ops_staff(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_working_hours (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  opens_at TEXT NOT NULL DEFAULT '09:00',
  closes_at TEXT NOT NULL DEFAULT '17:00',
  overnight BOOLEAN NOT NULL DEFAULT FALSE,
  break_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  break_starts_at TEXT NOT NULL DEFAULT '',
  break_ends_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, weekday)
);

CREATE TABLE IF NOT EXISTS workspace_ops_closed_days (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_specific_days (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  title TEXT NOT NULL,
  opens_at TEXT NOT NULL DEFAULT '08:00',
  closes_at TEXT NOT NULL DEFAULT '16:00',
  break_starts_at TEXT NOT NULL DEFAULT '',
  break_ends_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_expenses (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL DEFAULT 'none',
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_ops_appointments (
  workspace_id TEXT NOT NULL REFERENCES workspace_ops_profiles(workspace_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  staff_id TEXT,
  staff_name TEXT NOT NULL DEFAULT '',
  service_id TEXT,
  service_name TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  pricing_type TEXT NOT NULL DEFAULT 'fixed',
  price_min NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_max NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pricing_status TEXT NOT NULL DEFAULT 'fixed',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  check_in_token TEXT NOT NULL DEFAULT '',
  checked_in_at TIMESTAMPTZ,
  checked_in_by_staff_id TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_ops_appointments_check_in_token_idx
  ON workspace_ops_appointments (workspace_id, check_in_token)
  WHERE check_in_token <> '';

CREATE INDEX IF NOT EXISTS workspace_ops_appointments_date_idx
  ON workspace_ops_appointments (workspace_id, appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS workspace_ops_appointments_staff_idx
  ON workspace_ops_appointments (workspace_id, staff_id, appointment_date, status);

CREATE TABLE IF NOT EXISTS workspace_ops_appointment_line_items (
  workspace_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'primary',
  service_id TEXT,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pricing_type TEXT NOT NULL DEFAULT 'fixed',
  price_min NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_max NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pricing_status TEXT NOT NULL DEFAULT 'fixed',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  added_at TIMESTAMPTZ,
  added_by_staff_id TEXT,
  PRIMARY KEY (workspace_id, appointment_id, id),
  FOREIGN KEY (workspace_id, appointment_id)
    REFERENCES workspace_ops_appointments(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_appointment_visits (
  workspace_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, appointment_id, id),
  FOREIGN KEY (workspace_id, appointment_id)
    REFERENCES workspace_ops_appointments(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_ops_appointment_visit_meta (
  workspace_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  meta_key TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'null', 'json')),
  value_text TEXT,
  PRIMARY KEY (workspace_id, appointment_id, visit_id, meta_key),
  FOREIGN KEY (workspace_id, appointment_id, visit_id)
    REFERENCES workspace_ops_appointment_visits(workspace_id, appointment_id, id) ON DELETE CASCADE
);
