ALTER TABLE organizations ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'medical';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'ar';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'egp';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Cairo';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#2474df';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS organizations_workspace_id_idx
  ON organizations (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_templates (
  activity_type TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO activity_templates (activity_type, display_name, description, labels, defaults)
VALUES
  ('medical', 'مركز طبي', 'عيادات ومستشفيات ومراكز رعاية صحية',
   '{"customer":"المرضى","staff":"الأطباء","department":"الأقسام والعيادات","service":"الخدمات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"مريض","staff_singular":"طبيب","department_singular":"قسم"}'::jsonb),
  ('education', 'مركز تعليمي', 'مراكز التدريب والدروس والمدارس الصغيرة',
   '{"customer":"الطلاب","staff":"المدربين","department":"المواد والقاعات","service":"الدورات","appointment":"الحصص"}'::jsonb,
   '{"customer_singular":"طالب","staff_singular":"مدرب","department_singular":"مادة"}'::jsonb),
  ('billiards', 'صالة بلياردو', 'صالات البلياردو والألعاب والحجوزات بالساعة',
   '{"customer":"العملاء","staff":"المشرفين","department":"القاعات والطاولات","service":"الباقات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"مشرف","department_singular":"قاعة"}'::jsonb),
  ('salon', 'صالون', 'الصالونات ومراكز العناية الشخصية',
   '{"customer":"العملاء","staff":"مقدمي الخدمة","department":"الأقسام","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"مقدم خدمة","department_singular":"قسم"}'::jsonb),
  ('fitness', 'مركز رياضي', 'الصالات الرياضية والاستوديوهات والمدربين',
   '{"customer":"المشتركين","staff":"المدربين","department":"القاعات","service":"الحصص","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"مشترك","staff_singular":"مدرب","department_singular":"قاعة"}'::jsonb),
  ('other', 'نشاط مخصص', 'أي نشاط يعتمد على الخدمات والحجوزات',
   '{"customer":"العملاء","staff":"الفريق","department":"الأقسام","service":"الخدمات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"موظف","department_singular":"قسم"}'::jsonb)
ON CONFLICT (activity_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  labels = EXCLUDED.labels,
  defaults = EXCLUDED.defaults,
  updated_at = NOW();

UPDATE organizations
SET labels = COALESCE(NULLIF(labels, '{}'::jsonb), (SELECT labels FROM activity_templates WHERE activity_type = organizations.activity_type)),
    updated_at = NOW()
WHERE labels = '{}'::jsonb OR labels IS NULL;